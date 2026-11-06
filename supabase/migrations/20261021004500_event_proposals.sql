-- Therapists can propose a community event. It waits for a clinical reviewer or an Admin, who approves it (it goes live, as a staff event does)
-- or declines it with a reason the therapist can read. Members never see a proposal until it is approved.

alter table private.events add column if not exists status text not null default 'live' check (status in ('pending', 'live', 'declined', 'withdrawn'));
alter table private.events add column if not exists therapist_id text references private.therapists (id);
alter table private.events add column if not exists decline_reason text;
alter table private.events add column if not exists decided_by text;
alter table private.events add column if not exists decided_at timestamptz;
create index if not exists events_therapist_idx on private.events (therapist_id);

create or replace function private.event_json(e private.events, p_account uuid, p_staff boolean) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', e.id, 'title', e.title, 'blurb', e.blurb, 'kind', e.kind, 'mode', e.mode, 'place', e.place,
    'startsAt', private.ms(e.starts_at), 'durationMin', e.duration_min, 'host', e.host, 'status', e.status,
    'interested', (select count(*) from private.event_interest i where i.event_id = e.id and i.active),
    'interestedByMe', exists (select 1 from private.event_interest i where i.event_id = e.id and i.account_id = p_account and i.active),
    'cancelled', case when e.cancelled_at is null then null else jsonb_build_object('reason', e.cancel_reason, 'at', private.ms(e.cancelled_at)) end,
    'proposedBy', (select t.name from private.therapists t where t.id = e.therapist_id),
    'createdBy', case when p_staff then e.created_by else null end,
    'declineReason', case when p_staff then e.decline_reason else null end))
$$;

create or replace function public.event_list() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Events need an active plan.'); end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(private.event_json(e, uid, false) order by e.starts_at)
    from private.events e
    where e.status = 'live' and (
         (e.cancelled_at is null and e.starts_at + make_interval(mins => e.duration_min) > now())
      or (e.cancelled_at is not null and e.cancelled_at > now() - interval '7 days' and e.starts_at > now() - interval '1 day'))), '[]'::jsonb));
end;
$$;

create or replace function public.event_toggle_interest(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  e private.events;
  on_now boolean;
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Events need an active plan.'); end if;
  select * into e from private.events where id = p_id;
  if not found or e.status <> 'live' or e.cancelled_at is not null or e.starts_at + make_interval(mins => e.duration_min) <= now() then
    return private.fail('gone', 'That event isn’t open any more.');
  end if;
  insert into private.event_interest (event_id, account_id) values (p_id, uid)
    on conflict (event_id, account_id) do update set active = not private.event_interest.active
    returning active into on_now;
  return jsonb_build_object('ok', true, 'interested', on_now, 'count', (select count(*) from private.event_interest where event_id = p_id and active));
end;
$$;

-- Staff see every event, proposals first when they are waiting.
create or replace function public.admin_events() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(private.event_json(x, s.account_id, true) order by x.starts_at)
    from (select * from private.events order by (status = 'pending') desc, starts_at desc limit 60) x), '[]'::jsonb));
end;
$$;

create or replace function public.admin_cancel_event(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  e private.events;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins cancel events.'); end if;
  select * into e from private.events where id = p_id for update;
  if not found then return private.fail('gone', 'That event isn’t here.'); end if;
  if e.status <> 'live' then return private.fail('not-live', 'Only an event that is live can be cancelled. Decide a proposal instead.'); end if;
  if e.cancelled_at is not null then return private.fail('cancelled', 'It is already cancelled.'); end if;
  if e.starts_at + make_interval(mins => e.duration_min) <= now() then return private.fail('over', 'It has already finished.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  update private.events set cancelled_at = now(), cancel_reason = btrim(p_reason) where id = e.id;
  perform private.staff_log(s, 'Cancelled event', e.title, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- A therapist proposes an event. The details are checked as for a staff event, they run it themselves, and at most three wait at once.
create or replace function public.portal_propose_event(p_title text, p_blurb text, p_kind text, p_mode text, p_place text, p_starts timestamptz, p_duration int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  t private.therapists;
  tt text := btrim(coalesce(p_title, ''));
  bl text := btrim(coalesce(p_blurb, ''));
  pl text := btrim(coalesce(p_place, ''));
  eid uuid;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into t from private.therapists where id = tid;
  if t.suspended then return private.fail('suspended', 'Your account is paused, so you can’t propose events.'); end if;
  if char_length(tt) < 8 then return private.fail('invalid', 'Give it a title of at least 8 characters.'); end if;
  if char_length(tt) > 80 then return private.fail('invalid', 'Keep the title under 80 characters.'); end if;
  if char_length(bl) < 20 then return private.fail('invalid', 'Say what it is about in at least 20 characters.'); end if;
  if char_length(bl) > 400 then return private.fail('invalid', 'Keep the description under 400 characters.'); end if;
  if p_kind not in ('webinar', 'workshop', 'talk', 'walk', 'meetup') then return private.fail('invalid', 'Choose what kind of event it is.'); end if;
  if p_mode not in ('online', 'in-person') then return private.fail('invalid', 'Choose online or in person.'); end if;
  if char_length(pl) < 3 then return private.fail('invalid', case when p_mode = 'in-person' then 'Name the public place it happens.' else 'Add a short note on how people join.' end); end if;
  if char_length(pl) > 120 then return private.fail('invalid', 'Keep the place or note under 120 characters.'); end if;
  if p_duration is null or p_duration not between 30 and 240 then return private.fail('invalid', 'An event runs 30 to 240 minutes.'); end if;
  if p_starts is null or p_starts < now() + interval '3 days' then return private.fail('invalid', 'Propose it at least three days ahead, so it can be reviewed.'); end if;
  if (select count(*) from private.events where therapist_id = tid and status = 'pending') >= 3 then
    return private.fail('too-many', 'You already have three proposals waiting. Wait for a decision, or withdraw one.');
  end if;
  insert into private.events (title, blurb, kind, mode, place, starts_at, duration_min, host, created_by, status, therapist_id)
    values (tt, bl, p_kind, p_mode, pl, p_starts, p_duration, t.name, t.name, 'pending', tid) returning id into eid;
  return jsonb_build_object('ok', true, 'id', eid);
end;
$$;

create or replace function public.portal_events() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(private.event_json(x, uid, true) order by x.created_at desc)
    from (select * from private.events where therapist_id = tid order by created_at desc limit 30) x), '[]'::jsonb));
end;
$$;

create or replace function public.portal_withdraw_event(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare tid text := private.therapist_of(private.require_member());
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  update private.events set status = 'withdrawn' where id = p_id and therapist_id = tid and status = 'pending';
  if not found then return private.fail('gone', 'That proposal isn’t waiting any more.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A clinical reviewer or an Admin approves a proposal (it goes live) or declines it with a reason the therapist reads.
create or replace function public.admin_decide_event(p_id uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  e private.events;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins decide event proposals.'); end if;
  select * into e from private.events where id = p_id for update;
  if not found or e.status <> 'pending' then return private.fail('gone', 'That proposal isn’t waiting any more.'); end if;
  if p_approve then
    if e.starts_at < now() + interval '60 minutes' then return private.fail('late', 'The start time is too close or has passed. Decline it and ask for a new time.'); end if;
    update private.events set status = 'live', decided_by = s.name, decided_at = now() where id = e.id;
    perform private.staff_log(s, 'Approved event proposal', e.title, 'Proposed by ' || e.created_by);
  else
    if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'Say why, so the therapist can improve it.'); end if;
    update private.events set status = 'declined', decline_reason = btrim(p_reason), decided_by = s.name, decided_at = now() where id = e.id;
    perform private.staff_log(s, 'Declined event proposal', e.title, btrim(p_reason));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_propose_event(text, text, text, text, text, timestamptz, int), public.portal_events(), public.portal_withdraw_event(uuid), public.admin_decide_event(uuid, boolean, text) from public, anon;
grant execute on function public.portal_propose_event(text, text, text, text, text, timestamptz, int), public.portal_events(), public.portal_withdraw_event(uuid), public.admin_decide_event(uuid, boolean, text) to authenticated;
