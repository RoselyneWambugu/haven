-- The strike policy on the server, with two-person approval. Two numbers: how long a strike counts, and how long a restriction lasts.
-- Changing them needs a different Admin to approve, like a team change. With only one active Admin the change applies at once and the log says so.

create table if not exists private.strike_policy (
  id int primary key default 1 check (id = 1),
  expiry_days int not null default 90 check (expiry_days between 30 and 365),
  restriction_hours int not null default 24 check (restriction_hours between 1 and 168),
  updated_at timestamptz not null default now()
);
insert into private.strike_policy (id) values (1) on conflict (id) do nothing;

create table if not exists private.policy_changes (
  id uuid primary key default gen_random_uuid(),
  expiry_days int not null,
  restriction_hours int not null,
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
alter table private.strike_policy enable row level security;
alter table private.policy_changes enable row level security;

create or replace function private.expire_policy_changes() returns void
language sql set search_path = ''
as $$ update private.policy_changes set status = 'expired', decided_at = now() where status = 'pending' and created_at < now() - interval '1 day' $$;

-- Sanctions follow the policy: a warning counts for expiry_days, a restriction lasts restriction_hours.
create or replace function private.sanction(p_account uuid, p_kind text, p_rule text, p_case text, p_by text) returns uuid
language plpgsql set search_path = ''
as $$
declare
  nid uuid;
  pol private.strike_policy;
  exp timestamptz;
  expl text := case p_kind
    when 'warning' then 'This breaks our community guidelines. This is a warning, and nothing else changes.'
    when 'restriction' then 'You can’t send new messages for a short time. You can still read and use help.'
    else 'Your account is paused while our team reviews it. You can still reach urgent help.' end;
begin
  select * into pol from private.strike_policy where id = 1;
  exp := case p_kind when 'warning' then now() + make_interval(days => pol.expiry_days) when 'restriction' then now() + make_interval(hours => pol.restriction_hours) else null end;
  insert into private.notices (account_id, kind, rule, explanation, case_id, decided_by, expires_at)
    values (p_account, p_kind, p_rule, expl, p_case, p_by, exp) returning id into nid;
  if p_kind = 'restriction' then update public.accounts set standing = 'restricted' where account_id = p_account and standing = 'good';
  elsif p_kind = 'suspension' then update public.accounts set standing = 'paused' where account_id = p_account;
  end if;
  return nid;
end;
$$;

-- Strikes that are older than the policy's expiry no longer count towards the next sanction.
create or replace function private.strike_count(p_account uuid) returns int
language sql stable set search_path = ''
as $$
  select count(*)::int from private.notices n, private.strike_policy p
  where n.account_id = p_account and n.appeal <> 'overturned' and p.id = 1 and n.created_at > now() - make_interval(days => p.expiry_days)
$$;

-- The case queue shows each reported member's current strikes under the policy.
create or replace function private.cases_json(p_role text) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(c order by c->>'openedAtIso' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', 'C-r:' || r.id, 'severity', private.severity_of(r.reason), 'source', 'user-report', 'type', private.reason_label(r.reason),
      'slaMinutes', private.sla_minutes(private.severity_of(r.reason)), 'openedAt', private.ms(r.created_at), 'openedAtIso', r.created_at,
      'owner', cs.owner, 'status', coalesce(cs.status, 'new'),
      'reporter', coalesce((select p.pen_name from public.profiles p where p.account_id = r.reporter), 'A member'),
      'reported', coalesce(r.reported_name, 'Reported ' || r.target), 'snapshotAt', private.ms(r.created_at), 'ai', null,
      'strikes', private.strike_count(r.reported),
      'priorReports', r.prior_reports, 'queue', r.queue, 'therapistId', r.therapist_id,
      'decision', cs.decision, 'escalated', coalesce(cs.escalated, false),
      'evidence', case when r.snapshot is not null and jsonb_array_length(r.snapshot) > 0 then r.snapshot
                       else jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reported', 'text', coalesce(nullif(r.note, ''), 'No content was captured for this report.'), 'reported', true)) end
    ) as c
    from private.reports r
    left join private.case_state cs on cs.case_id = 'r:' || r.id
    where r.queue is distinct from 'clinical' or p_role in ('clinical', 'admin')
    union all
    select jsonb_build_object(
      'id', 'C-k:' || k.id, 'severity', case when k.danger or k.type in ('self-harm', 'harm-to-others') then 'S1' else 'S2' end, 'source', 'user-report',
      'type', 'Therapist concern: ' || k.type,
      'slaMinutes', private.sla_minutes(case when k.danger or k.type in ('self-harm', 'harm-to-others') then 'S1' else 'S2' end),
      'openedAt', private.ms(k.created_at), 'openedAtIso', k.created_at, 'owner', cs.owner, 'status', coalesce(cs.status, 'new'),
      'reporter', th.name, 'reported', 'Session concern', 'snapshotAt', private.ms(k.created_at), 'ai', null, 'strikes', 0,
      'priorReports', (select count(*) from private.concerns k2 where k2.therapist_id = k.therapist_id and k2.id <> k.id),
      'queue', 'clinical', 'therapistId', k.therapist_id, 'decision', cs.decision, 'escalated', coalesce(cs.escalated, false),
      'evidence', jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reporter', 'text', coalesce(nullif(k.detail, ''), 'No detail was given.')))
    ) as c
    from private.concerns k
    join private.therapists th on th.id = k.therapist_id
    left join private.case_state cs on cs.case_id = 'k:' || k.id
    where p_role in ('clinical', 'admin')
  ) q
$$;

create or replace function public.admin_policy() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  p private.strike_policy;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  perform private.expire_policy_changes();
  select * into p from private.strike_policy where id = 1;
  return jsonb_build_object('ok', true, 'policy', jsonb_build_object('expiryDays', p.expiry_days, 'restrictionHours', p.restriction_hours),
    'pending', (select jsonb_build_object('id', c.id, 'policy', jsonb_build_object('expiryDays', c.expiry_days, 'restrictionHours', c.restriction_hours),
                  'requestedBy', c.requested_name, 'mine', c.requested_by = s.account_id, 'at', private.ms(c.created_at))
                from private.policy_changes c where c.status = 'pending' order by c.created_at desc limit 1));
end;
$$;

create or replace function public.admin_propose_policy(p_expiry_days int, p_restriction_hours int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  cid uuid;
  label text := coalesce(p_expiry_days::text, '?') || ' days, ' || coalesce(p_restriction_hours::text, '?') || ' hours';
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the strike policy.'); end if;
  if p_expiry_days is null or p_restriction_hours is null or p_expiry_days < 30 or p_expiry_days > 365 or p_restriction_hours < 1 or p_restriction_hours > 168 then
    return private.fail('range', 'Use 30 to 365 days for expiry and 1 to 168 hours for restrictions.');
  end if;
  perform private.expire_policy_changes();
  if exists (select 1 from private.strike_policy where id = 1 and expiry_days = p_expiry_days and restriction_hours = p_restriction_hours) then
    return private.fail('same', 'That is already the policy.');
  end if;
  if private.active_admins(s.account_id) = 0 then
    update private.strike_policy set expiry_days = p_expiry_days, restriction_hours = p_restriction_hours, updated_at = now() where id = 1;
    perform private.staff_log(s, 'Changed strike policy without a second approver', 'Strike policy', label);
    return jsonb_build_object('ok', true, 'applied', true);
  end if;
  if exists (select 1 from private.policy_changes where status = 'pending') then
    return private.fail('pending', 'Another policy change is waiting for a second Admin. Decide or withdraw it first.');
  end if;
  insert into private.policy_changes (expiry_days, restriction_hours, requested_by, requested_name) values (p_expiry_days, p_restriction_hours, s.account_id, s.name) returning id into cid;
  perform private.staff_log(s, 'Proposed strike policy change', 'Strike policy', label);
  return jsonb_build_object('ok', true, 'proposed', true, 'id', cid);
end;
$$;

create or replace function public.admin_decide_policy(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.policy_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the strike policy.'); end if;
  perform private.expire_policy_changes();
  select * into c from private.policy_changes where id = p_id for update;
  if not found or c.status <> 'pending' then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by = s.account_id then return private.fail('second-person', 'A second Admin has to decide this.'); end if;
  if p_approve then
    update private.strike_policy set expiry_days = c.expiry_days, restriction_hours = c.restriction_hours, updated_at = now() where id = 1;
    update private.policy_changes set status = 'approved', decided_by = s.name, decided_at = now() where id = c.id;
    perform private.staff_log(s, 'Approved strike policy change', 'Strike policy', c.expiry_days || ' days, ' || c.restriction_hours || ' hours; proposed by ' || c.requested_name);
  else
    update private.policy_changes set status = 'declined', decided_by = s.name, decided_at = now() where id = c.id;
    perform private.staff_log(s, 'Declined strike policy change', 'Strike policy');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_withdraw_policy(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.policy_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the strike policy.'); end if;
  select * into c from private.policy_changes where id = p_id and status = 'pending' for update;
  if not found then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by <> s.account_id then return private.fail('not-yours', 'Only the person who proposed it can withdraw it. Another Admin can decline it.'); end if;
  update private.policy_changes set status = 'withdrawn', decided_by = s.name, decided_at = now() where id = c.id;
  perform private.staff_log(s, 'Withdrew strike policy change', 'Strike policy');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_policy(), public.admin_propose_policy(int, int), public.admin_decide_policy(uuid, boolean), public.admin_withdraw_policy(uuid) from public, anon;
grant execute on function public.admin_policy(), public.admin_propose_policy(int, int), public.admin_decide_policy(uuid, boolean), public.admin_withdraw_policy(uuid) to authenticated;
