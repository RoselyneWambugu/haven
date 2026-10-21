-- Slice 7: the admin dashboard.
-- Staff sign in with the same phone code as everyone else, but only a number linked to a row in private.staff gets in.
-- Every staff action is a function that checks the role, does the work, and writes an audit row in the same transaction.
-- Nothing here uses delete or drop, so it can be applied through the migration tool.

create table if not exists private.staff (
  account_id uuid primary key references auth.users (id) on delete cascade,
  name text not null unique check (char_length(name) between 3 and 30),
  role text not null check (role in ('moderator', 'clinical', 'billing', 'admin')),
  heavy boolean not null default false,
  active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  role text not null,
  action text not null,
  target text not null default '',
  reason text not null default ''
);

-- Cases are rows in private.reports (members) and private.concerns (therapists). This holds what staff have done with each.
-- Ids are 'r:<uuid>' for a report and 'k:<uuid>' for a concern.
create table if not exists private.case_state (
  case_id text primary key,
  owner text,
  status text not null default 'new' check (status in ('new', 'in-review', 'waiting', 'closed')),
  decision jsonb,
  escalated boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists private.notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('warning', 'restriction', 'suspension')),
  rule text not null,
  explanation text not null,
  case_id text,
  decided_by text not null default 'Echo team',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  appeal text not null default 'none' check (appeal in ('none', 'pending', 'upheld', 'reduced', 'overturned')),
  appeal_text text,
  appeal_at timestamptz,
  appeal_reviewer text,
  appeal_response text
);
create index if not exists notices_account_idx on private.notices (account_id, created_at desc);

create table if not exists private.reveals (
  staff_id uuid not null references auth.users (id) on delete cascade,
  case_id text not null,
  line_id text not null,
  at timestamptz not null default now(),
  primary key (staff_id, case_id, line_id)
);

alter table private.staff enable row level security;
alter table private.audit enable row level security;
alter table private.case_state enable row level security;
alter table private.notices enable row level security;
alter table private.reveals enable row level security;

-- ---------------------------------------------------------------- helpers

create or replace function private.staff_of(p_account uuid) returns private.staff
language sql stable set search_path = ''
as $$ select s from private.staff s where s.account_id = p_account and s.active $$;

create or replace function private.staff_log(p_staff private.staff, p_action text, p_target text, p_reason text default '') returns void
language sql set search_path = ''
as $$ insert into private.audit (actor, role, action, target, reason) values (p_staff.name, p_staff.role, p_action, coalesce(p_target, ''), coalesce(p_reason, '')) $$;

-- Who may do what. This mirrors the table in the dashboard (src/lib/roles.ts) and is the one that is enforced.
create or replace function private.staff_can(p_role text, p_cap text) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_cap
    when 'suspendRestore' then p_role in ('moderator', 'admin')
    when 'verifyTherapists' then p_role in ('clinical', 'admin')
    when 'readClinical' then p_role in ('clinical', 'admin')
    when 'work' then p_role in ('moderator', 'clinical', 'admin')
    when 'exportData' then p_role = 'admin'
    else false
  end
$$;

create or replace function private.severity_of(p_reason text) returns text
language sql immutable set search_path = ''
as $$
  select case p_reason
    when 'self-harm' then 'S1' when 'threats' then 'S1' when 'therapist-boundaries' then 'S1'
    when 'sexual' then 'S2' when 'hate' then 'S2' when 'harassment' then 'S2' when 'scam' then 'S2'
    when 'therapist-conduct' then 'S2' when 'therapist-privacy' then 'S2'
    else 'S3'
  end
$$;

create or replace function private.reason_label(p_reason text) returns text
language sql immutable set search_path = ''
as $$
  select case p_reason
    when 'self-harm' then 'Self-harm concern' when 'threats' then 'Threat' when 'sexual' then 'Sexual content' when 'hate' then 'Hate speech'
    when 'harassment' then 'Harassment' when 'scam' then 'Scam or solicitation' when 'impersonation' then 'Impersonation'
    when 'therapist-conduct' then 'Therapist conduct' when 'therapist-boundaries' then 'Therapist boundaries' when 'therapist-privacy' then 'Therapist privacy'
    else 'Other'
  end
$$;

create or replace function private.sla_minutes(p_sev text) returns int
language sql immutable set search_path = ''
as $$ select case p_sev when 'S1' then 60 when 'S2' then 240 else 720 end $$;

-- Warning, then restriction, then suspension. Severity 1 goes straight to suspension.
create or replace function private.next_sanction(p_strikes int, p_sev text) returns text
language sql immutable set search_path = ''
as $$ select case when p_sev = 'S1' then 'suspension' when p_strikes <= 0 then 'warning' when p_strikes = 1 then 'restriction' else 'suspension' end $$;

create or replace function private.ms(p_t timestamptz) returns bigint
language sql immutable set search_path = ''
as $$ select (extract(epoch from p_t) * 1000)::bigint $$;

-- The sanction that is in force right now has to be reflected on the account, and lifted when it ends.
create or replace function private.sanction(p_account uuid, p_kind text, p_rule text, p_case text, p_by text) returns uuid
language plpgsql set search_path = ''
as $$
declare
  nid uuid;
  exp timestamptz := case p_kind when 'warning' then now() + interval '90 days' when 'restriction' then now() + interval '1 day' else null end;
  expl text := case p_kind
    when 'warning' then 'This breaks our community guidelines. This is a warning, and nothing else changes.'
    when 'restriction' then 'You can’t send new messages for a short time. You can still read and use help.'
    else 'Your account is paused while our team reviews it. You can still reach urgent help.' end;
begin
  insert into private.notices (account_id, kind, rule, explanation, case_id, decided_by, expires_at)
    values (p_account, p_kind, p_rule, expl, p_case, p_by, exp) returning id into nid;
  if p_kind = 'restriction' then update public.accounts set standing = 'restricted' where account_id = p_account and standing = 'good';
  elsif p_kind = 'suspension' then update public.accounts set standing = 'paused' where account_id = p_account;
  end if;
  return nid;
end;
$$;

create or replace function private.expire_restrictions() returns void
language sql set search_path = ''
as $$
  update public.accounts a set standing = 'good'
  where a.standing = 'restricted'
    and not exists (select 1 from private.notices n where n.account_id = a.account_id and n.kind = 'restriction' and n.expires_at > now() and n.appeal not in ('overturned'));
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'echo-expire-restrictions';
select cron.schedule('echo-expire-restrictions', '*/5 * * * *', 'select private.expire_restrictions()');

-- Posts that need a person to look at them wait for staff. If nobody gets to one in a day, it goes live rather than staying hidden forever.
create or replace function private.auto_approve_after() returns interval language sql immutable set search_path = '' as $$ select interval '1 day' $$;

-- ---------------------------------------------------------------- members' own notices and appeals

create or replace function public.my_notices() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'notices', coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'rule', n.rule, 'explanation', n.explanation, 'at', private.ms(n.created_at),
      'expires_at', case when n.expires_at is null then null else private.ms(n.expires_at) end, 'appeal', n.appeal, 'appeal_text', n.appeal_text) order by n.created_at desc)
    from private.notices n where n.account_id = uid), '[]'::jsonb));
end;
$$;

create or replace function public.appeal_notice(p_notice uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  n private.notices;
  t text := btrim(coalesce(p_text, ''));
begin
  select * into n from private.notices where id = p_notice and account_id = uid for update;
  if not found then return private.fail('gone', 'Notice not found.'); end if;
  if n.appeal <> 'none' then return private.fail('appealed', 'You have already appealed this.'); end if;
  if char_length(t) < 10 then return private.fail('short', 'Tell us what happened in a sentence or two.'); end if;
  update private.notices set appeal = 'pending', appeal_text = left(t, 2000), appeal_at = now() where id = n.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- staff sign-in

create or replace function public.staff_me() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.staff := private.staff_of(uid);
begin
  if s.account_id is null then return private.fail('not-staff', 'This number isn’t linked to a staff account.'); end if;
  update private.staff set last_sign_in_at = now() where account_id = uid;
  perform private.staff_log(s, 'Signed in', 'Dashboard', 'Phone code');
  return jsonb_build_object('ok', true, 'name', s.name, 'role', s.role, 'heavy', s.heavy);
end;
$$;

-- ---------------------------------------------------------------- the dashboard's data

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
      'strikes', coalesce((select count(*) from private.notices n where n.account_id = r.reported and n.appeal <> 'overturned'), 0),
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

create or replace function public.admin_state() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.staff := private.staff_of(uid);
begin
  if s.account_id is null then return private.fail('not-staff', 'This number isn’t linked to a staff account.'); end if;
  return jsonb_build_object(
    'ok', true, 'name', s.name, 'role', s.role, 'heavy', s.heavy,
    'staff', coalesce((select jsonb_agg(jsonb_build_object('id', x.account_id, 'name', x.name, 'role', x.role, 'active', x.active, 'last_sign_in_at', case when x.last_sign_in_at is null then null else private.ms(x.last_sign_in_at) end) order by x.name) from private.staff x), '[]'::jsonb),
    'cases', private.cases_json(s.role),
    'users', case when s.role in ('moderator', 'billing', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.account_id, 'penName', p.pen_name, 'joined', to_char(a.created_at, 'DD Mon YYYY'), 'languages', array_to_string(p.languages, ', '), 'ageBand', p.age_band,
        'standing', a.standing, 'plan', case when private.has_plan(a.account_id) then 'Active plan' else 'No plan' end,
        'strikes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'at', private.ms(n.created_at), 'rule', n.rule,
                    'kind', case n.kind when 'warning' then 'Warning' when 'restriction' then 'Restriction' else 'Suspension' end) order by n.created_at desc)
                    from private.notices n where n.account_id = a.account_id), '[]'::jsonb),
        'reportsAgainst', (select count(*) from private.reports r where r.reported = a.account_id),
        'reportsMade', (select count(*) from private.reports r where r.reporter = a.account_id),
        'blocksReceived', (select count(*) from private.blocks b where b.blocked = a.account_id),
        'matches', (select count(*) from public.conversation_members m join public.conversations c on c.id = m.conversation_id where m.account_id = a.account_id and c.kind = 'peer'),
        'skips', 0) order by a.created_at desc)
      from (select * from public.accounts order by created_at desc limit 200) a join public.profiles p on p.account_id = a.account_id), '[]'::jsonb) else '[]'::jsonb end,
    'appeals', case when s.role in ('moderator', 'clinical', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', 'A-' || n.id, 'noticeId', n.id, 'caseId', coalesce('C-' || n.case_id, 'C-user'), 'penName', p.pen_name,
        'decision', n.kind || ': ' || n.rule, 'decidedBy', n.decided_by, 'statement', coalesce(n.appeal_text, ''), 'openedAt', private.ms(coalesce(n.appeal_at, n.created_at)),
        'slaHours', 24, 'status', case n.appeal when 'pending' then 'open' else n.appeal end, 'reviewer', n.appeal_reviewer, 'response', n.appeal_response) order by n.appeal_at desc)
      from private.notices n join public.profiles p on p.account_id = n.account_id where n.appeal <> 'none'), '[]'::jsonb) else '[]'::jsonb end,
    'held', case when s.role in ('moderator', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'body', q.body, 'author', p.pen_name, 'at', private.ms(q.created_at), 'topic', q.topic) order by q.created_at)
      from private.posts q join public.profiles p on p.account_id = q.author_id where q.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end,
    'therapists', case when s.role in ('clinical', 'admin') then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'suspended', t.suspended, 'paused', t.paused) order by t.name) from private.therapists t), '[]'::jsonb) else '[]'::jsonb end,
    'audit', case when s.role in ('clinical', 'admin') then coalesce((select jsonb_agg(jsonb_build_object('id', u.id::text, 'at', private.ms(u.at), 'actor', u.actor, 'role', u.role, 'action', u.action, 'target', u.target, 'reason', u.reason) order by u.at desc)
                          from (select * from private.audit order by id desc limit 200) u), '[]'::jsonb) else '[]'::jsonb end,
    'revealed', coalesce((select jsonb_agg(v.case_id || ':' || v.line_id) from private.reveals v where v.staff_id = uid), '[]'::jsonb),
    'reveals_today', (select count(*) from private.reveals v where v.staff_id = uid and v.at > now() - interval '1 day')
  );
end;
$$;

-- ---------------------------------------------------------------- working a case

create or replace function private.case_exists(p_case text, p_role text) returns boolean
language sql stable set search_path = ''
as $$
  select case when p_case like 'C-r:%' then exists (select 1 from private.reports r where 'C-r:' || r.id = p_case and (r.queue is distinct from 'clinical' or p_role in ('clinical', 'admin')))
              when p_case like 'C-k:%' then p_role in ('clinical', 'admin') and exists (select 1 from private.concerns k where 'C-k:' || k.id = p_case)
              else false end
$$;

create or replace function public.admin_claim(p_case text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  sev text;
  cur private.case_state;
begin
  if s.account_id is null or not private.staff_can(s.role, 'work') then return private.fail('role', 'Your role doesn’t work cases.'); end if;
  if not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  sev := (select c->>'severity' from jsonb_array_elements(private.cases_json(s.role)) c where c->>'id' = p_case);
  if sev = 'S1' and s.role = 'moderator' and not s.heavy then
    return private.fail('rota', 'Severity-1 and crisis cases are worked by the moderators on this week’s heavy-queue rota. Ask someone on the rota, or a clinical reviewer.');
  end if;
  select * into cur from private.case_state where case_id = substr(p_case, 3);
  if found and cur.owner is not null and cur.owner <> s.name then return private.fail('taken', 'Someone else has taken this case.'); end if;
  insert into private.case_state (case_id, owner, status) values (substr(p_case, 3), s.name, 'in-review')
    on conflict (case_id) do update set owner = s.name, status = case when private.case_state.status = 'new' then 'in-review' else private.case_state.status end, updated_at = now();
  perform private.staff_log(s, 'Took case', p_case);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_view(p_case text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  perform private.staff_log(s, 'Viewed case content', p_case, 'Review');
  return jsonb_build_object('ok', true);
end;
$$;

-- Revealing a flagged message line is counted per person, per day.
create or replace function public.admin_reveal(p_case text, p_line text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n int;
begin
  if s.account_id is null or not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  if exists (select 1 from private.reveals where staff_id = s.account_id and case_id = p_case and line_id = p_line) then return jsonb_build_object('ok', true); end if;
  select count(*) into n from private.reveals where staff_id = s.account_id and at > now() - interval '1 day';
  if n >= 20 then return private.fail('limit', 'You’ve reached today’s limit. Take a break, and ask a colleague to continue.'); end if;
  insert into private.reveals (staff_id, case_id, line_id) values (s.account_id, p_case, p_line);
  perform private.staff_log(s, 'Revealed message', p_case || ':' || p_line);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_decide(p_case text, p_action text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c jsonb;
  raw text := substr(p_case, 3);
  r private.reports;
  strikes int;
  sev text;
  sanction text;
  reasn text := btrim(coalesce(p_reason, ''));
  target uuid;
  kind text;
  th text;
begin
  if s.account_id is null or not private.staff_can(s.role, 'work') then return private.fail('role', 'Your role doesn’t decide cases.'); end if;
  if not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  if char_length(reasn) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  if p_action not in ('dismiss', 'strike', 'restrict', 'suspend', 'escalate', 'warn-therapist', 'pause-therapist') then return private.fail('action', 'Choose what to do.'); end if;
  c := (select x from jsonb_array_elements(private.cases_json(s.role)) x where x->>'id' = p_case);
  if exists (select 1 from private.case_state where case_id = raw and status = 'closed') then return private.fail('closed', 'This case is already closed.'); end if;
  sev := c->>'severity'; strikes := (c->>'strikes')::int; th := c->>'therapistId';
  if c->>'queue' = 'clinical' and p_action not in ('dismiss', 'warn-therapist', 'pause-therapist', 'escalate') then
    return private.fail('action', 'A therapist concern is closed with no action, a warning, a pause on new clients, or escalation.');
  end if;
  if c->>'queue' is distinct from 'clinical' and p_action in ('warn-therapist', 'pause-therapist') then return private.fail('action', 'That action is only for therapist concerns.'); end if;
  if p_action in ('strike', 'restrict', 'suspend') and not private.staff_can(s.role, 'suspendRestore') then
    return private.fail('role', 'Your role recommends a sanction. Escalate the case so a moderator or Admin can apply it.');
  end if;
  if p_action in ('strike', 'restrict', 'suspend') and p_case like 'C-r:%' then
    select * into r from private.reports where id = substr(p_case, 5)::uuid;
    target := r.reported;
    if target is not null then
      sanction := case p_action when 'strike' then private.next_sanction(strikes, sev) when 'restrict' then 'restriction' else 'suspension' end;
      perform private.sanction(target, sanction, c->>'type', p_case, s.name);
    end if;
    if r.target = 'post' and r.target_id is not null then update private.posts set status = 'hidden', publish_after = null where id = r.target_id; end if;
  end if;
  if p_action = 'warn-therapist' then null;
  elsif p_action = 'pause-therapist' and th is not null then update private.therapists set paused = true where id = th;
  end if;
  insert into private.case_state (case_id, owner, status, decision, escalated)
    values (raw, case when p_action = 'escalate' then null else s.name end, case when p_action = 'escalate' then 'waiting' else 'closed' end,
            jsonb_build_object('action', p_action, 'reason', reasn, 'by', s.name, 'at', private.ms(now())), p_action = 'escalate')
    on conflict (case_id) do update set owner = excluded.owner, status = excluded.status, decision = excluded.decision, escalated = excluded.escalated or private.case_state.escalated, updated_at = now();
  perform private.staff_log(s, case p_action when 'dismiss' then 'Dismissed case' when 'escalate' then 'Escalated case' else 'Decided: ' || p_action end, p_case, reasn);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- therapists

create or replace function public.admin_lift_pause(p_therapist text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins lift a pause.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  if not exists (select 1 from private.therapists where id = p_therapist and paused) then return private.fail('none', 'There is no pause to lift.'); end if;
  update private.therapists set paused = false where id = p_therapist;
  perform private.staff_log(s, 'Lifted therapist pause', p_therapist, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_suspend_therapist(p_therapist text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.therapists;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins suspend therapists.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  select * into t from private.therapists where id = p_therapist;
  if not found then return private.fail('gone', 'Therapist not found.'); end if;
  if t.suspended then return private.fail('already', 'Already suspended.'); end if;
  update private.therapists set suspended = true where id = p_therapist;
  -- Booked sessions are cancelled with no charge.
  update private.sessions set status = 'cancelled' where therapist_id = p_therapist and status = 'booked' and start_at > now();
  perform private.staff_log(s, 'Suspended therapist', t.name, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_reinstate_therapist(p_therapist text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.therapists;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins reinstate therapists.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  select * into t from private.therapists where id = p_therapist and suspended;
  if not found then return private.fail('none', 'This therapist is not suspended.'); end if;
  update private.therapists set suspended = false where id = p_therapist;
  perform private.staff_log(s, 'Reinstated therapist', t.name, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- members

create or replace function public.admin_user_action(p_account uuid, p_action text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  nm text;
  reasn text := btrim(coalesce(p_reason, ''));
begin
  if s.account_id is null or not private.staff_can(s.role, 'suspendRestore') then return private.fail('role', 'Your role can’t suspend or restore accounts.'); end if;
  if char_length(reasn) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  if p_action not in ('restrict', 'suspend', 'restore') then return private.fail('action', 'Choose what to do.'); end if;
  select pen_name into nm from public.profiles where account_id = p_account;
  if nm is null then return private.fail('gone', 'User not found.'); end if;
  if p_action = 'restore' then
    update public.accounts set standing = 'good' where account_id = p_account;
    update private.notices set expires_at = least(coalesce(expires_at, now()), now()) where account_id = p_account and kind in ('restriction') and (expires_at is null or expires_at > now());
  else
    perform private.sanction(p_account, case p_action when 'restrict' then 'restriction' else 'suspension' end, reasn, null, s.name);
  end if;
  perform private.staff_log(s, case p_action when 'restore' then 'Restored user' when 'restrict' then 'Restricted user' else 'Suspended user' end, nm, reasn);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- appeals

create or replace function public.admin_decide_appeal(p_notice uuid, p_outcome text, p_explanation text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n private.notices;
  expl text := btrim(coalesce(p_explanation, ''));
begin
  if s.account_id is null or not private.staff_can(s.role, 'work') then return private.fail('role', 'Your role doesn’t decide appeals.'); end if;
  if p_outcome not in ('upheld', 'reduced', 'overturned') then return private.fail('outcome', 'Choose an outcome.'); end if;
  select * into n from private.notices where id = p_notice for update;
  if not found or n.appeal = 'none' then return private.fail('gone', 'Appeal not found.'); end if;
  if n.appeal <> 'pending' then return private.fail('decided', 'This appeal has already been decided.'); end if;
  if n.decided_by = s.name then return private.fail('same-reviewer', 'You made the original decision. An appeal must be reviewed by someone else.'); end if;
  if char_length(expl) < 10 then return private.fail('explanation', 'Explain the outcome to the member.'); end if;
  update private.notices set appeal = p_outcome, appeal_reviewer = s.name, appeal_response = expl where id = n.id;
  -- Overturned takes the sanction away. Reduced takes it one step down: a suspension becomes a restriction, a restriction ends.
  if n.kind = 'restriction' and p_outcome in ('overturned', 'reduced') then
    update private.notices set expires_at = now() where id = n.id;
  end if;
  if n.kind = 'suspension' and p_outcome = 'overturned' then
    update public.accounts set standing = 'good' where account_id = n.account_id;
  elsif n.kind = 'suspension' and p_outcome = 'reduced' then
    update public.accounts set standing = 'restricted' where account_id = n.account_id;
  elsif n.kind = 'restriction' and p_outcome in ('overturned', 'reduced') then
    update public.accounts set standing = 'good' where account_id = n.account_id and standing = 'restricted';
  end if;
  perform private.staff_log(s, 'Appeal ' || p_outcome, 'A-' || n.id, expl);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- held posts

create or replace function public.admin_review_post(p_post uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  q private.posts;
begin
  if s.account_id is null or s.role not in ('moderator', 'admin') then return private.fail('role', 'Only moderators and Admins review held posts.'); end if;
  select * into q from private.posts where id = p_post and status = 'pending' for update;
  if not found then return private.fail('gone', 'This post has already been reviewed.'); end if;
  update private.posts set status = case when p_approve then 'published' else 'hidden' end, publish_after = null where id = q.id;
  perform private.staff_log(s, case when p_approve then 'Approved held post' else 'Removed held post' end, 'P-' || q.id, coalesce(p_reason, ''));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- permissions

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.my_notices(), public.appeal_notice(uuid, text), public.staff_me(), public.admin_state(), public.admin_claim(text), public.admin_view(text),
  public.admin_reveal(text, text), public.admin_decide(text, text, text), public.admin_lift_pause(text, text), public.admin_suspend_therapist(text, text),
  public.admin_reinstate_therapist(text, text), public.admin_user_action(uuid, text, text), public.admin_decide_appeal(uuid, text, text),
  public.admin_review_post(uuid, boolean, text)
  from public, anon;
grant execute on function
  public.my_notices(), public.appeal_notice(uuid, text), public.staff_me(), public.admin_state(), public.admin_claim(text), public.admin_view(text),
  public.admin_reveal(text, text), public.admin_decide(text, text, text), public.admin_lift_pause(text, text), public.admin_suspend_therapist(text, text),
  public.admin_reinstate_therapist(text, text), public.admin_user_action(uuid, text, text), public.admin_decide_appeal(uuid, text, text),
  public.admin_review_post(uuid, boolean, text)
  to authenticated;
