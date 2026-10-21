-- Member feedback and therapist applications on the server. Nothing here uses delete or drop.
--
-- Feedback: the "did you feel heard?" answer is kept after the chat is deleted (the chat is gone in a day, the answer is not), and
-- Settings notes are stored without a name or account. Staff see notes and shares, never who wrote them. Answers are shown only
-- when at least 10 people have answered.
--
-- Therapist applications: a therapist applies after signing in with their phone. A clinical reviewer or Admin checks the licence
-- and decides. Approving creates the therapist, links the applicant's number, and leaves them paused until they finish their profile.
-- Uploading documents is not built yet, so an application records details only.

create table if not exists private.heard (
  id bigint generated always as identity primary key,
  conversation_id uuid not null,
  account_id uuid not null references auth.users (id) on delete cascade,
  score int check (score between 1 and 5),
  skipped boolean not null default false,
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (conversation_id, account_id)
);
create table if not exists private.feedback (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('idea', 'bug', 'other')),
  body text not null,
  with_device boolean not null default false,
  created_at timestamptz not null default now(),
  reviewed_by text
);
-- Only here to limit how many notes one person can send. It holds no text, and is not joined to the note.
create table if not exists private.feedback_log (
  account_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists feedback_log_idx on private.feedback_log (account_id, created_at desc);
alter table private.heard enable row level security;
alter table private.feedback enable row level security;
alter table private.feedback_log enable row level security;

create or replace function public.rate_heard(p_conversation uuid, p_score int, p_comment text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if p_score is null or p_score not between 1 and 5 then return private.fail('score', 'Pick one of the faces.'); end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.account_id = uid) then
    return private.fail('gone', 'That conversation is gone.');
  end if;
  insert into private.heard (conversation_id, account_id, score, comment) values (p_conversation, uid, p_score, left(btrim(coalesce(p_comment, '')), 500))
    on conflict (conversation_id, account_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.skip_heard(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.account_id = uid) then
    insert into private.heard (conversation_id, account_id, skipped) values (p_conversation, uid, true) on conflict (conversation_id, account_id) do nothing;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.send_feedback(p_kind text, p_text text, p_with_device boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  t text := btrim(coalesce(p_text, ''));
begin
  if t = '' then return private.fail('empty', 'Write a few words first.'); end if;
  if char_length(t) > 1000 then return private.fail('long', 'Please keep it under 1000 characters.'); end if;
  if p_kind not in ('idea', 'bug', 'other') then return private.fail('kind', 'Choose what this is.'); end if;
  if (select count(*) from private.feedback_log where account_id = uid and created_at > now() - interval '1 day') >= 10 then
    return private.fail('limit', 'Thank you. You have sent a lot today. Try again tomorrow.');
  end if;
  insert into private.feedback_log (account_id) values (uid);
  insert into private.feedback (kind, body, with_device) values (p_kind, t, coalesce(p_with_device, false));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_feedback() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n_answered int;
  n_skipped int;
  shares jsonb;
  positive int;
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Your role can’t open feedback.'); end if;
  select count(*) filter (where not skipped), count(*) filter (where skipped) into n_answered, n_skipped from private.heard;
  if n_answered >= 10 then
    select jsonb_agg(round(100.0 * (select count(*) from private.heard h where not h.skipped and h.score = f) / n_answered)::int order by f) into shares from generate_series(1, 5) f;
    positive := round(100.0 * (select count(*) from private.heard h where not h.skipped and h.score >= 4) / n_answered)::int;
  else
    shares := '[null,null,null,null,null]'::jsonb;
  end if;
  return jsonb_build_object('ok', true,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', 'fb' || n.id, 'kind', n.kind, 'text', n.body, 'at', private.ms(n.created_at), 'withDevice', n.with_device, 'reviewedBy', n.reviewed_by) order by n.created_at desc)
                       from (select * from private.feedback order by created_at desc limit 200) n), '[]'::jsonb),
    'heard', jsonb_build_object('answered', case when n_answered >= 10 then n_answered end, 'skipped', case when n_answered >= 10 and n_skipped >= 10 then n_skipped end, 'shares', shares, 'positive', positive));
end;
$$;

create or replace function public.admin_review_feedback(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n private.feedback;
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Your role can’t open feedback.'); end if;
  select * into n from private.feedback where id = nullif(regexp_replace(coalesce(p_id, ''), '\D', '', 'g'), '')::bigint for update;
  if not found then return private.fail('gone', 'That note is gone.'); end if;
  if n.reviewed_by is null then
    update private.feedback set reviewed_by = s.name where id = n.id;
    perform private.staff_log(s, 'Marked feedback as read', n.kind || ' note');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- therapist applications

create table if not exists private.applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  title text not null,
  gender text not null check (gender in ('woman', 'man')),
  licence_body text not null,
  licence_number text not null,
  licence_expiry date not null,
  status text not null default 'pending' check (status in ('pending', 'info', 'approved', 'rejected')),
  checklist jsonb not null default '{"name":false,"licence":false,"expiry":false,"qualification":false}'::jsonb,
  message text not null default '',
  decided_by text,
  decided_at timestamptz,
  therapist_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.applications enable row level security;

create or replace function public.submit_application(p_name text, p_title text, p_gender text, p_licence_number text, p_licence_expiry date, p_consent_public boolean, p_consent_conduct boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  ex private.applications;
  nm text := btrim(coalesce(p_name, ''));
  tt text := coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'Counsellor');
  ln text := btrim(coalesce(p_licence_number, ''));
begin
  if exists (select 1 from private.therapists where account_id = uid) then return private.fail('therapist', 'This number is already linked to a therapist.'); end if;
  if exists (select 1 from private.staff where account_id = uid) then return private.fail('staff', 'This number belongs to a staff account.'); end if;
  if char_length(nm) < 3 or char_length(nm) > 80 then return private.fail('name', 'Add your full name.'); end if;
  if ln = '' or char_length(ln) > 40 then return private.fail('licence', 'Add your licence number.'); end if;
  if p_gender not in ('woman', 'man') then return private.fail('gender', 'Choose one so members can filter by it.'); end if;
  if p_licence_expiry is null or p_licence_expiry <= current_date then return private.fail('expiry', 'Your licence must be valid. Add its expiry date.'); end if;
  if not coalesce(p_consent_public, false) or not coalesce(p_consent_conduct, false) then return private.fail('consent', 'Please accept both statements to continue.'); end if;
  select * into ex from private.applications where account_id = uid for update;
  if found then
    if ex.status not in ('info') then return private.fail('exists', 'You already have an application.'); end if;
    update private.applications set name = nm, title = left(tt, 60), gender = p_gender, licence_number = ln, licence_expiry = p_licence_expiry, status = 'pending', updated_at = now() where id = ex.id;
  else
    insert into private.applications (account_id, name, title, gender, licence_body, licence_number, licence_expiry)
      values (uid, nm, left(tt, 60), p_gender, 'Counsellors and Psychologists Board', ln, p_licence_expiry);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.my_application() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  a private.applications;
begin
  select * into a from private.applications where account_id = uid;
  if not found then return jsonb_build_object('ok', true, 'status', 'none'); end if;
  return jsonb_build_object('ok', true, 'status', a.status, 'message', a.message, 'name', a.name);
end;
$$;

create or replace function public.admin_applicants() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'applicants', coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'licenceNo', a.licence_number, 'licenceExpiry', private.ms(a.licence_expiry::timestamptz),
      'checklist', a.checklist, 'status', a.status, 'message', a.message) order by (a.status = 'pending') desc, a.created_at)
    from (select * from private.applications order by created_at desc limit 200) a), '[]'::jsonb));
end;
$$;

create or replace function public.admin_verify_applicant(p_id uuid, p_decision text, p_message text, p_checklist jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  a private.applications;
  msg text := btrim(coalesce(p_message, ''));
  tid text;
  all_ok boolean;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins verify therapists.'); end if;
  if p_decision not in ('approved', 'info', 'rejected') then return private.fail('decision', 'Choose a decision.'); end if;
  select * into a from private.applications where id = p_id for update;
  if not found then return private.fail('gone', 'Applicant not found.'); end if;
  if a.status <> 'pending' then return private.fail('decided', 'This application has already been decided.'); end if;
  all_ok := coalesce((p_checklist->>'name')::boolean, false) and coalesce((p_checklist->>'licence')::boolean, false)
        and coalesce((p_checklist->>'expiry')::boolean, false) and coalesce((p_checklist->>'qualification')::boolean, false);
  if p_decision = 'approved' and not all_ok then return private.fail('checklist', 'Tick every check before approving.'); end if;
  if char_length(msg) < 5 then return private.fail('message', 'Write a message to the applicant.'); end if;
  if p_decision = 'approved' then
    if exists (select 1 from private.therapists where account_id = a.account_id) then return private.fail('therapist', 'This number is already linked to a therapist.'); end if;
    tid := 't-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    -- They stay hidden from new bookings until they have written a profile and set their hours.
    insert into private.therapists (id, account_id, name, title, tone, gender, bio, modes, licence_body, licence_number, licence_valid_to, accepting_new, paused)
      values (tid, a.account_id, a.name, a.title, 'a', a.gender, 'Profile coming soon.', array['chat'], a.licence_body, a.licence_number, a.licence_expiry, false, true);
  end if;
  update private.applications set status = p_decision, message = left(msg, 1000), checklist = coalesce(p_checklist, checklist), decided_by = s.name, decided_at = now(), therapist_id = tid, updated_at = now() where id = a.id;
  perform private.staff_log(s, case p_decision when 'approved' then 'Approved therapist' when 'info' then 'Requested more information' else 'Rejected therapist' end, a.name, msg);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.rate_heard(uuid, int, text), public.skip_heard(uuid), public.send_feedback(text, text, boolean), public.admin_feedback(), public.admin_review_feedback(text),
  public.submit_application(text, text, text, text, date, boolean, boolean), public.my_application(), public.admin_applicants(), public.admin_verify_applicant(uuid, text, text, jsonb) from public, anon;
grant execute on function public.rate_heard(uuid, int, text), public.skip_heard(uuid), public.send_feedback(text, text, boolean), public.admin_feedback(), public.admin_review_feedback(text),
  public.submit_application(text, text, text, text, date, boolean, boolean), public.my_application(), public.admin_applicants(), public.admin_verify_applicant(uuid, text, text, jsonb) to authenticated;
