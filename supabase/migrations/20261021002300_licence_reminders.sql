-- Licence expiry (PRD THR-15, ADM-6). The server reminds a therapist 60, 30 and 7 days before their licence runs out, and when it has.
-- An expired licence hides the therapist from booking until a clinical reviewer or Admin approves a renewal.

create table if not exists private.licence_reminders (
  therapist_id text not null references private.therapists (id),
  stage int not null check (stage in (60, 30, 7, 0)),
  valid_to date not null,
  created_at timestamptz not null default now(),
  primary key (therapist_id, stage, valid_to)
);
create table if not exists private.licence_renewals (
  id uuid primary key default gen_random_uuid(),
  therapist_id text not null references private.therapists (id),
  licence_number text not null,
  new_expiry date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  decided_by text,
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz
);
create index if not exists licence_renewals_idx on private.licence_renewals (therapist_id, created_at desc);
alter table private.licence_reminders enable row level security;
alter table private.licence_renewals enable row level security;

-- 60, 30, 7 or 0 (expired): the closest stage a licence has reached, or null while it has more than 60 days.
create or replace function private.licence_stage(p_valid_to date) returns int
language sql stable set search_path = ''
as $$ select case when p_valid_to <= private.today() then 0 when p_valid_to - private.today() <= 7 then 7 when p_valid_to - private.today() <= 30 then 30 when p_valid_to - private.today() <= 60 then 60 end $$;

create or replace function private.tick_licences() returns void
language plpgsql set search_path = ''
as $$
begin
  insert into private.licence_reminders (therapist_id, stage, valid_to)
    select t.id, private.licence_stage(t.licence_valid_to), t.licence_valid_to from private.therapists t where private.licence_stage(t.licence_valid_to) is not null
    on conflict do nothing;
end;
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'echo-tick-licences';
select cron.schedule('echo-tick-licences', '0 5 * * *', 'select private.tick_licences()');
select private.tick_licences();

-- An expired licence hides the therapist from booking, the same way a suspension does.
select private.patch_function('private.slot_ok(text, text, timestamptz, uuid, boolean)'::regprocedure,
  'if not found or t\.suspended then return false; end if;',
  'if not found or t.suspended or t.licence_valid_to < private.today() then return false; end if;', 'licence_valid_to < private.today()');
select private.patch_function('public.therapist_directory()'::regprocedure,
  'from private\.therapists t where not t\.suspended\)',
  'from private.therapists t where not t.suspended and t.licence_valid_to >= private.today())', 'licence_valid_to >= private.today()');

-- The therapist: where the licence stands, the reminders sent, and the latest renewal.
create or replace function public.portal_licence() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  t private.therapists;
  r private.licence_renewals;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into t from private.therapists where id = tid;
  select * into r from private.licence_renewals where therapist_id = tid order by created_at desc limit 1;
  return jsonb_build_object('ok', true, 'stage', private.licence_stage(t.licence_valid_to), 'validTo', private.ms(t.licence_valid_to::timestamptz), 'number', t.licence_number,
    'reminders', coalesce((select jsonb_agg(jsonb_build_object('stage', x.stage, 'at', private.ms(x.created_at)) order by x.created_at desc)
                           from private.licence_reminders x where x.therapist_id = tid and x.valid_to = t.licence_valid_to), '[]'::jsonb),
    'renewal', case when r.id is null then null else jsonb_build_object('status', r.status, 'number', r.licence_number, 'newExpiry', private.ms(r.new_expiry::timestamptz), 'note', r.note) end);
end;
$$;

create or replace function public.portal_submit_renewal(p_number text, p_expiry date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  t private.therapists;
  ln text := btrim(coalesce(p_number, ''));
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into t from private.therapists where id = tid;
  if ln = '' or char_length(ln) > 40 then return private.fail('licence', 'Add your licence number.'); end if;
  if p_expiry is null or p_expiry <= private.today() or p_expiry <= t.licence_valid_to then return private.fail('expiry', 'The new expiry date must be later than your current one.'); end if;
  if p_expiry > private.today() + 1830 then return private.fail('expiry', 'That date is too far ahead. Check it against your certificate.'); end if;
  if exists (select 1 from private.licence_renewals where therapist_id = tid and status = 'pending') then return private.fail('pending', 'Your renewal is already with a reviewer.'); end if;
  insert into private.licence_renewals (therapist_id, licence_number, new_expiry) values (tid, ln, p_expiry);
  return jsonb_build_object('ok', true);
end;
$$;

-- Staff: clinical reviewers and Admins. Every therapist, how long their licence has left, and any renewal waiting.
create or replace function public.admin_licences() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'licences', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'validTo', private.ms(t.licence_valid_to::timestamptz), 'number', t.licence_number, 'stage', private.licence_stage(t.licence_valid_to),
      'lastReminderAt', (select private.ms(max(x.created_at)) from private.licence_reminders x where x.therapist_id = t.id and x.valid_to = t.licence_valid_to),
      'renewal', (select jsonb_build_object('id', r.id, 'number', r.licence_number, 'newExpiry', private.ms(r.new_expiry::timestamptz)) from private.licence_renewals r where r.therapist_id = t.id and r.status = 'pending' limit 1))
      order by t.licence_valid_to)
    from private.therapists t), '[]'::jsonb));
end;
$$;

create or replace function public.admin_decide_renewal(p_id uuid, p_approve boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  r private.licence_renewals;
  nt text := btrim(coalesce(p_note, ''));
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins decide renewals.'); end if;
  select * into r from private.licence_renewals where id = p_id for update;
  if not found then return private.fail('gone', 'Renewal not found.'); end if;
  if r.status <> 'pending' then return private.fail('decided', 'This renewal has already been decided.'); end if;
  if char_length(nt) < 5 then return private.fail('note', 'Say what you checked, or why not.'); end if;
  if p_approve then
    update private.therapists set licence_number = r.licence_number, licence_valid_to = r.new_expiry where id = r.therapist_id;
  end if;
  update private.licence_renewals set status = case when p_approve then 'approved' else 'rejected' end, note = nt, decided_by = s.name, decided_at = now() where id = r.id;
  perform private.staff_log(s, case when p_approve then 'Approved licence renewal' else 'Rejected licence renewal' end, r.therapist_id, nt);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_licence(), public.portal_submit_renewal(text, date), public.admin_licences(), public.admin_decide_renewal(uuid, boolean, text) from public, anon;
grant execute on function public.portal_licence(), public.portal_submit_renewal(text, date), public.admin_licences(), public.admin_decide_renewal(uuid, boolean, text) to authenticated;
