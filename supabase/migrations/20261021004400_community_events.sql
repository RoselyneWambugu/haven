-- Community events: webinars, workshops and walks that Echo staff put on. Members say they are interested and nothing more:
-- Echo keeps a count, and who is interested is never shown to anyone, staff included.

create table if not exists private.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 8 and 80),
  blurb text not null check (char_length(blurb) between 20 and 400),
  kind text not null check (kind in ('webinar', 'workshop', 'talk', 'walk', 'meetup')),
  mode text not null check (mode in ('online', 'in-person')),
  place text not null check (char_length(place) between 3 and 120),
  starts_at timestamptz not null,
  duration_min int not null check (duration_min between 30 and 240),
  host text not null check (char_length(host) between 2 and 60),
  created_by text not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text
);
create index if not exists events_starts_idx on private.events (starts_at);

create table if not exists private.event_interest (
  event_id uuid not null references private.events (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  active boolean not null default true,
  primary key (event_id, account_id)
);
create index if not exists event_interest_account_idx on private.event_interest (account_id);

alter table private.events enable row level security;
alter table private.event_interest enable row level security;

create or replace function private.event_json(e private.events, p_account uuid, p_staff boolean) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', e.id, 'title', e.title, 'blurb', e.blurb, 'kind', e.kind, 'mode', e.mode, 'place', e.place,
    'startsAt', private.ms(e.starts_at), 'durationMin', e.duration_min, 'host', e.host,
    'interested', (select count(*) from private.event_interest i where i.event_id = e.id and i.active),
    'interestedByMe', exists (select 1 from private.event_interest i where i.event_id = e.id and i.account_id = p_account and i.active),
    'cancelled', case when e.cancelled_at is null then null else jsonb_build_object('reason', e.cancel_reason, 'at', private.ms(e.cancelled_at)) end,
    'createdBy', case when p_staff then e.created_by else null end))
$$;

-- What a member sees: events that have not finished, and ones that were cancelled in the last week.
create or replace function public.event_list() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Events need an active plan.'); end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(private.event_json(e, uid, false) order by e.starts_at)
    from private.events e
    where (e.cancelled_at is null and e.starts_at + make_interval(mins => e.duration_min) > now())
       or (e.cancelled_at is not null and e.cancelled_at > now() - interval '7 days' and e.starts_at > now() - interval '1 day')), '[]'::jsonb));
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
  if not found or e.cancelled_at is not null or e.starts_at + make_interval(mins => e.duration_min) <= now() then
    return private.fail('gone', 'That event isn’t open any more.');
  end if;
  insert into private.event_interest (event_id, account_id) values (p_id, uid)
    on conflict (event_id, account_id) do update set active = not private.event_interest.active
    returning active into on_now;
  return jsonb_build_object('ok', true, 'interested', on_now, 'count', (select count(*) from private.event_interest where event_id = p_id and active));
end;
$$;

-- Staff see every upcoming event and the most recent ones that are over or cancelled.
create or replace function public.admin_events() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(private.event_json(x, s.account_id, true) order by x.starts_at)
    from (select * from private.events order by starts_at desc limit 40) x), '[]'::jsonb));
end;
$$;

create or replace function public.admin_schedule_event(p_title text, p_blurb text, p_kind text, p_mode text, p_place text, p_starts timestamptz, p_duration int, p_host text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  tt text := btrim(coalesce(p_title, ''));
  bl text := btrim(coalesce(p_blurb, ''));
  pl text := btrim(coalesce(p_place, ''));
  hs text := btrim(coalesce(p_host, ''));
  eid uuid;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins schedule events.'); end if;
  if char_length(tt) < 8 then return private.fail('invalid', 'Give it a title of at least 8 characters.'); end if;
  if char_length(tt) > 80 then return private.fail('invalid', 'Keep the title under 80 characters.'); end if;
  if char_length(bl) < 20 then return private.fail('invalid', 'Say what it is about in at least 20 characters.'); end if;
  if char_length(bl) > 400 then return private.fail('invalid', 'Keep the description under 400 characters.'); end if;
  if p_kind not in ('webinar', 'workshop', 'talk', 'walk', 'meetup') then return private.fail('invalid', 'Choose what kind of event it is.'); end if;
  if p_mode not in ('online', 'in-person') then return private.fail('invalid', 'Choose online or in person.'); end if;
  if char_length(pl) < 3 then return private.fail('invalid', case when p_mode = 'in-person' then 'Name the public place it happens.' else 'Add a short note on how people join.' end); end if;
  if char_length(pl) > 120 then return private.fail('invalid', 'Keep the place or note under 120 characters.'); end if;
  if char_length(hs) < 2 then return private.fail('invalid', 'Say who is running it.'); end if;
  if p_duration is null or p_duration not between 30 and 240 then return private.fail('invalid', 'An event runs 30 to 240 minutes.'); end if;
  if p_starts is null or p_starts < now() + interval '60 minutes' then return private.fail('invalid', 'Schedule it at least an hour ahead, so people can see it.'); end if;
  insert into private.events (title, blurb, kind, mode, place, starts_at, duration_min, host, created_by)
    values (tt, bl, p_kind, p_mode, pl, p_starts, p_duration, hs, s.name) returning id into eid;
  perform private.staff_log(s, 'Scheduled event', tt, p_kind || ', ' || p_mode);
  return jsonb_build_object('ok', true, 'id', eid);
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
  if e.cancelled_at is not null then return private.fail('cancelled', 'It is already cancelled.'); end if;
  if e.starts_at + make_interval(mins => e.duration_min) <= now() then return private.fail('over', 'It has already finished.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  update private.events set cancelled_at = now(), cancel_reason = btrim(p_reason) where id = e.id;
  perform private.staff_log(s, 'Cancelled event', e.title, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.event_list(), public.event_toggle_interest(uuid), public.admin_events(), public.admin_schedule_event(text, text, text, text, text, timestamptz, int, text), public.admin_cancel_event(uuid, text) from public, anon;
grant execute on function public.event_list(), public.event_toggle_interest(uuid), public.admin_events(), public.admin_schedule_event(text, text, text, text, text, timestamptz, int, text), public.admin_cancel_event(uuid, text) to authenticated;
