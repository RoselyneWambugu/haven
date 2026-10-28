-- Therapist appeals (PRD THR-12 and the clinical-review rules). A therapist can appeal a warning, a pause on new clients or a suspension.
-- A different clinical reviewer from the one who decided reads it. The outcome leaves the decision in force, steps it down one level, or removes it.

create table if not exists private.therapist_decisions (
  id uuid primary key default gen_random_uuid(),
  therapist_id text not null references private.therapists (id),
  kind text not null check (kind in ('warning', 'paused', 'suspended')),
  body text not null,
  decided_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  cleared_at timestamptz
);
create index if not exists therapist_decisions_idx on private.therapist_decisions (therapist_id) where cleared_at is null;
create table if not exists private.therapist_appeals (
  id uuid primary key default gen_random_uuid(),
  therapist_id text not null references private.therapists (id),
  decision_text text not null,
  decided_by text not null,
  statement text not null,
  status text not null default 'open' check (status in ('open', 'upheld', 'reduced', 'overturned')),
  reviewer text,
  response text,
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz
);
create index if not exists therapist_appeals_idx on private.therapist_appeals (therapist_id, created_at desc);
alter table private.therapist_decisions enable row level security;
alter table private.therapist_appeals enable row level security;

-- Writes down a decision that is now in force. The wording for a warning or a pause is the same as the member app's.
create or replace function private.record_decision(p_therapist text, p_kind text, p_by text, p_body text default null) returns void
language sql set search_path = ''
as $$
  insert into private.therapist_decisions (therapist_id, kind, body, decided_by)
  values (p_therapist, p_kind, coalesce(p_body, case p_kind
    when 'warning' then 'A clinical reviewer has looked at a concern raised about a session and asked you to review our standards of practice. This is a warning, not a suspension.'
    else 'New clients are paused while a clinical reviewer looks at a concern raised about a session. Your existing clients are not affected. A clinical reviewer will lift the pause.' end), p_by)
$$;

create or replace function private.clear_decisions(p_therapist text, p_kinds text[]) returns void
language sql set search_path = ''
as $$ update private.therapist_decisions set cleared_at = now() where therapist_id = p_therapist and cleared_at is null and kind = any(p_kinds) $$;

-- Every route that puts a decision in force, or lifts it, now keeps the record.
select private.patch_function('public.admin_decide(text, text, text)'::regprocedure,
  'if p_action = ''pause-therapist'' and th is not null then update private\.therapists set paused = true where id = th;',
  'if p_action = ''warn-therapist'' and th is not null then perform private.record_decision(th, ''warning'', s.name); end if;
  if p_action = ''pause-therapist'' and th is not null then update private.therapists set paused = true where id = th; perform private.record_decision(th, ''paused'', s.name);', 'record_decision(th, ''warning''');
select private.patch_function('public.admin_suspend_therapist(text, text)'::regprocedure,
  'update private\.therapists set suspended = true where id = p_therapist;',
  'update private.therapists set suspended = true where id = p_therapist; perform private.record_decision(p_therapist, ''suspended'', s.name, btrim(p_reason));', 'record_decision(p_therapist');
select private.patch_function('public.admin_lift_pause(text, text)'::regprocedure,
  'update private\.therapists set paused = false where id = p_therapist;',
  'update private.therapists set paused = false where id = p_therapist; perform private.clear_decisions(p_therapist, array[''paused'', ''warning'']);', 'clear_decisions(p_therapist');
select private.patch_function('public.admin_reinstate_therapist(text, text)'::regprocedure,
  'update private\.therapists set suspended = false where id = p_therapist;',
  'update private.therapists set suspended = false where id = p_therapist; perform private.clear_decisions(p_therapist, array[''suspended'']);', 'clear_decisions(p_therapist');

-- The therapist: what is in force against them (the most serious one), and their latest appeal.
create or replace function public.portal_appeal_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  d private.therapist_decisions;
  a private.therapist_appeals;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into d from private.therapist_decisions where therapist_id = tid and cleared_at is null
    order by case kind when 'suspended' then 0 when 'paused' then 1 else 2 end, created_at desc limit 1;
  select * into a from private.therapist_appeals where therapist_id = tid order by created_at desc limit 1;
  return jsonb_build_object('ok', true,
    'decision', case when d.id is null then null else jsonb_build_object('kind', d.kind, 'by', d.decided_by, 'at', private.ms(d.created_at), 'text', d.body) end,
    'appeal', case when a.id is null then null else jsonb_build_object('id', 'TA-' || a.id, 'status', a.status, 'response', a.response, 'openedAt', private.ms(a.created_at), 'slaHours', 72) end);
end;
$$;

create or replace function public.portal_appeal(p_statement text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  d private.therapist_decisions;
  t text := btrim(coalesce(p_statement, ''));
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into d from private.therapist_decisions where therapist_id = tid and cleared_at is null
    order by case kind when 'suspended' then 0 when 'paused' then 1 else 2 end, created_at desc limit 1;
  if d.id is null then return private.fail('none', 'There is no decision to appeal.'); end if;
  if char_length(t) < 20 then return private.fail('statement', 'Tell us your side in at least 20 characters.'); end if;
  if char_length(t) > 2000 then return private.fail('statement', 'Please keep it under 2,000 characters.'); end if;
  if exists (select 1 from private.therapist_appeals where therapist_id = tid and status = 'open') then return private.fail('open', 'You already have an appeal waiting for a decision.'); end if;
  insert into private.therapist_appeals (therapist_id, decision_text, decided_by, statement)
    values (tid, case d.kind when 'suspended' then 'Suspension' when 'paused' then 'Pause on new clients' else 'Warning' end || ': ' || d.body, d.decided_by, t);
  return jsonb_build_object('ok', true);
end;
$$;

-- Staff: clinical reviewers and Admins only. Shaped like a member's appeal so the same screens show it.
create or replace function public.admin_therapist_appeals() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'appeals', coalesce((
    select jsonb_agg(jsonb_build_object('id', 'TA-' || a.id, 'noticeId', null, 'caseId', '', 'penName', t.name, 'decision', a.decision_text, 'decidedBy', a.decided_by,
      'statement', a.statement, 'openedAt', private.ms(a.created_at), 'slaHours', 72, 'status', a.status, 'reviewer', a.reviewer, 'response', a.response, 'therapistId', a.therapist_id) order by a.created_at desc)
    from private.therapist_appeals a join private.therapists t on t.id = a.therapist_id), '[]'::jsonb));
end;
$$;

create or replace function public.admin_decide_therapist_appeal(p_id text, p_outcome text, p_explanation text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  a private.therapist_appeals;
  d private.therapist_decisions;
  expl text := btrim(coalesce(p_explanation, ''));
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins decide therapist appeals.'); end if;
  if p_outcome not in ('upheld', 'reduced', 'overturned') then return private.fail('outcome', 'Choose an outcome.'); end if;
  select * into a from private.therapist_appeals where 'TA-' || id = p_id for update;
  if not found then return private.fail('gone', 'Appeal not found.'); end if;
  if a.status <> 'open' then return private.fail('decided', 'This appeal has already been decided.'); end if;
  if a.decided_by = s.name then return private.fail('same-reviewer', 'You made the original decision. An appeal must be reviewed by someone else.'); end if;
  if char_length(expl) < 10 then return private.fail('explanation', 'Explain the outcome to the therapist.'); end if;
  select * into d from private.therapist_decisions where therapist_id = a.therapist_id and cleared_at is null
    order by case kind when 'suspended' then 0 when 'paused' then 1 else 2 end, created_at desc limit 1;
  if d.id is not null and p_outcome = 'overturned' then
    perform private.clear_decisions(a.therapist_id, array['warning', 'paused', 'suspended']);
    update private.therapists set suspended = false, paused = case when d.kind = 'warning' then paused else false end where id = a.therapist_id;
  elsif d.id is not null and p_outcome = 'reduced' then
    perform private.clear_decisions(a.therapist_id, array[d.kind]);
    if d.kind = 'suspended' then
      update private.therapists set suspended = false, paused = true where id = a.therapist_id;
      perform private.record_decision(a.therapist_id, 'paused', s.name);
    elsif d.kind = 'paused' then
      update private.therapists set paused = false where id = a.therapist_id;
      perform private.record_decision(a.therapist_id, 'warning', s.name);
    end if;
  end if;
  update private.therapist_appeals set status = p_outcome, reviewer = s.name, response = expl, decided_at = now() where id = a.id;
  perform private.staff_log(s, 'Therapist appeal ' || p_outcome, p_id, expl);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_appeal_state(), public.portal_appeal(text), public.admin_therapist_appeals(), public.admin_decide_therapist_appeal(text, text, text) from public, anon;
grant execute on function public.portal_appeal_state(), public.portal_appeal(text), public.admin_therapist_appeals(), public.admin_decide_therapist_appeal(text, text, text) to authenticated;
