-- Echo backend, slice 6: the therapist's side. A therapist signs in with their phone, like a member, and is linked to a
-- therapist record by staff. Safe to run more than once.
--
-- To link a therapist to a phone that has signed in once:
--   update private.therapists set account_id = (select id from auth.users where phone = '254712345678') where id = 't-amina';

alter table private.therapists add column if not exists paused boolean not null default false;
alter table private.therapists add column if not exists per_day int not null default 5 check (per_day between 1 and 10);
alter table private.therapists add column if not exists buffer_min int not null default 15 check (buffer_min between 0 and 60);
alter table private.therapists add column if not exists new_per_week int not null default 3 check (new_per_week between 0 and 15);
alter table private.therapists add column if not exists payout_method text not null default '';
alter table private.therapists add column if not exists payout_schedule text not null default 'weekly' check (payout_schedule in ('weekly', 'monthly'));
alter table private.therapist_availability add column if not exists active boolean not null default true;

create table if not exists private.therapist_time_off (
  id uuid primary key default gen_random_uuid(),
  therapist_id text not null references private.therapists (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  removed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table private.sessions add column if not exists attendance text check (attendance in ('attended', 'late', 'no-show'));
alter table private.sessions add column if not exists note text not null default '';
alter table private.sessions add column if not exists started_at timestamptz;
alter table private.sessions add column if not exists gross_kes int;

create table if not exists private.concerns (
  id uuid primary key default gen_random_uuid(),
  therapist_id text not null references private.therapists (id),
  session_id uuid,
  danger boolean not null default false,
  type text not null check (type in ('self-harm', 'harm-to-others', 'abuse', 'behaviour')),
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table private.comments add column if not exists therapist_id text references private.therapists (id);

alter table private.therapist_time_off enable row level security;
alter table private.concerns enable row level security;

create or replace function private.therapist_of(p_account uuid) returns text
language sql stable set search_path = ''
as $$ select t.id from private.therapists t where t.account_id = p_account $$;

-- A therapist's reply is general information. It does not invite people to book or to make contact outside Echo.
create or replace function private.is_solicitation(p_text text) returns boolean
language sql immutable set search_path = ''
as $$
  select p_text ~* '\y(book|see|visit|consult)\s+(a\s+session\s+)?with\s+me\y'
      or p_text ~* '\y(message|dm|pm|inbox|contact|call|text|whatsapp)\s+me\y'
      or p_text ~* '\ymy\s+(clinic|practice|rates|fees|prices|services|number|page)\y'
      or p_text ~* '\yi\s+(charge|offer\s+(sessions|therapy|counselling)|can\s+treat|can\s+help\s+you\s+privately)\y'
      or p_text ~* '\y(private|one[- ]on[- ]one)\s+(session|therapy|counselling)\y'
      or p_text ~* '\yhire\s+me\y'
$$;

create or replace function private.ensure_therapist_members(p_therapist text) returns void
language sql set search_path = ''
as $$
  insert into public.conversation_members (conversation_id, account_id)
  select c.id, t.account_id from public.conversations c join private.therapists t on t.id = c.therapist_id
  where c.therapist_id = p_therapist and c.kind = 'therapist' and t.account_id is not null
    and not exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.account_id = t.account_id)
$$;

create or replace function private.ensure_therapist_chat(p_member uuid, p_therapist text, p_start timestamptz) returns uuid
language plpgsql set search_path = ''
as $$
declare
  conv uuid;
  tname text;
begin
  select c.id into conv from public.conversations c join public.conversation_members m on m.conversation_id = c.id
    where m.account_id = p_member and c.kind = 'therapist' and c.therapist_id = p_therapist and c.ended_at is null and c.expires_at > now() limit 1;
  if conv is not null then return conv; end if;
  select name into tname from private.therapists where id = p_therapist;
  insert into public.conversations (kind, therapist_id, expires_at) values ('therapist', p_therapist, now() + interval '7 days') returning id into conv;
  insert into public.conversation_members (conversation_id, account_id) values (conv, p_member);
  perform private.ensure_therapist_members(p_therapist);
  perform private.say(conv, 'Session booked for ' || to_char(p_start at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI') || '. You can message ' || tname || ' here before then. Chats with a therapist are deleted every week, unless reported.');
  return conv;
end;
$$;

-- Whether a session could start at this time. Now also honours a therapist's pause, time off, daily limit and buffer.
create or replace function private.slot_ok(p_therapist text, p_mode text, p_start timestamptz, p_exclude uuid default null, p_for_new boolean default true) returns boolean
language plpgsql stable set search_path = ''
as $$
declare
  t private.therapists;
  loc timestamp;
  tod time;
  b record;
  quarter timestamptz := to_timestamp(ceil(extract(epoch from now()) / 900) * 900);
  block_start timestamptz;
  gap numeric;
begin
  select * into t from private.therapists where id = p_therapist;
  if not found or t.suspended then return false; end if;
  if p_for_new and (not t.accepting_new or t.paused) then return false; end if;
  if not (p_mode = any (t.modes)) then return false; end if;
  if p_start <= now() - interval '1 minute' or p_start > now() + interval '14 days' then return false; end if;
  gap := (45 + t.buffer_min) * 60;
  if exists (select 1 from private.sessions s where s.therapist_id = p_therapist and s.status = 'booked' and (p_exclude is null or s.id <> p_exclude)
             and abs(extract(epoch from (s.start_at - p_start))) < gap) then return false; end if;
  if (select count(*) from private.sessions s where s.therapist_id = p_therapist and s.status = 'booked' and (p_exclude is null or s.id <> p_exclude)
        and (s.start_at at time zone 'Africa/Nairobi')::date = (p_start at time zone 'Africa/Nairobi')::date) >= t.per_day then return false; end if;
  if exists (select 1 from private.therapist_time_off o where o.therapist_id = p_therapist and not o.removed and o.start_at < p_start + interval '45 minutes' and o.end_at > p_start) then return false; end if;
  loc := p_start at time zone 'Africa/Nairobi';
  tod := loc::time;
  for b in select * from private.therapist_availability a
           where a.therapist_id = p_therapist and a.active and a.dow = extract(dow from loc)::int and p_mode = any (a.modes)
             and tod >= a.start_time and tod + interval '45 minutes' <= a.end_time
  loop
    if p_start >= now() + interval '2 hours' and (extract(epoch from (tod - b.start_time)) / 60)::int % 60 = 0 then return true; end if;
    block_start := (loc::date + b.start_time) at time zone 'Africa/Nairobi';
    if p_start <= now() + interval '60 minutes' and abs(extract(epoch from (p_start - greatest(quarter, block_start)))) < 900 and (extract(epoch from p_start))::bigint % 900 = 0 then return true; end if;
  end loop;
  return false;
end;
$$;

-- Therapists can read live posts everywhere, so they can reply.
create or replace function private.can_read_post(p_post uuid, p_account uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from private.posts p left join private.spaces s on s.id = p.space_id
    where p.id = p_post and (
      p.author_id = p_account
      or (p.status = 'published' and (s.id is null or not s.sensitive or private.therapist_of(p_account) is not null
          or exists (select 1 from private.space_members m where m.space_id = s.id and m.account_id = p_account))))
  )
$$;

create or replace function public.therapist_directory() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'therapists', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'title', t.title, 'tone', t.tone, 'gender', t.gender, 'bio', t.bio,
      'specialisations', t.specialisations, 'languages', t.languages, 'modes', t.modes, 'price_kes', t.price_kes,
      'licence_body', t.licence_body, 'licence_number', t.licence_number, 'licence_valid_to', (extract(epoch from t.licence_valid_to) * 1000)::bigint,
      'accepting_new', t.accepting_new and not t.paused and not exists (select 1 from private.therapist_time_off o where o.therapist_id = t.id and not o.removed and o.start_at <= now() and o.end_at > now()),
      'rating_sum', coalesce((select sum(s.rating_stars) from private.sessions s where s.therapist_id = t.id and s.rating_stars is not null), 0),
      'rating_count', (select count(s.rating_stars) from private.sessions s where s.therapist_id = t.id and s.rating_stars is not null),
      'availability', coalesce((select jsonb_agg(jsonb_build_object('dow', a.dow, 'start', to_char(a.start_time, 'HH24:MI'), 'end', to_char(a.end_time, 'HH24:MI'), 'modes', a.modes) order by a.dow, a.start_time)
                                from private.therapist_availability a where a.therapist_id = t.id and a.active), '[]'::jsonb),
      'taken', coalesce((select jsonb_agg((extract(epoch from s.start_at) * 1000)::bigint order by s.start_at) from private.sessions s
                         where s.therapist_id = t.id and s.status = 'booked' and s.start_at > now() - interval '1 hour' and s.start_at < now() + interval '15 days'), '[]'::jsonb)
    ) order by t.name) from private.therapists t where not t.suspended), '[]'::jsonb));
end;
$$;

-- The community feed. A therapist's replies show their name; a therapist can read it without a plan.
create or replace function public.forum_feed() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) and private.therapist_of(uid) is null then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  update private.posts set status = 'published', publish_after = null where status = 'pending' and publish_after <= now();
  return jsonb_build_object(
    'ok', true,
    'spaces', coalesce((select jsonb_agg(m.space_id order by m.joined_at) from private.space_members m where m.account_id = uid), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'author_name', pr.pen_name, 'author_avatar', pr.avatar,
        'author_key', case when p.author_id = uid then 'me' else pr.public_key::text end,
        'topic', p.topic, 'space', p.space_id, 'title', p.title, 'body', p.body, 'created_at', p.created_at, 'status', p.status, 'mine', p.author_id = uid,
        'supports', (select count(*) from private.supports s where s.post_id = p.id),
        'supported_by_me', exists (select 1 from private.supports s where s.post_id = p.id and s.account_id = uid),
        'comments', coalesce((select jsonb_agg(jsonb_build_object(
                                'id', c.id, 'author_name', coalesce(th.name, cp.pen_name), 'author_avatar', case when th.id is not null then 'leaf' else cp.avatar end,
                                'therapist_id', th.id, 'therapist_name', th.name, 'text', c.body, 'at', c.created_at, 'mine', c.author_id = uid) order by c.created_at)
                              from (select * from private.comments cc where cc.post_id = p.id order by cc.created_at desc limit 100) c
                              left join public.profiles cp on cp.account_id = c.author_id
                              left join private.therapists th on th.id = c.therapist_id), '[]'::jsonb)
      ) order by p.created_at desc)
      from (select * from private.posts q where private.can_read_post(q.id, uid) order by q.created_at desc limit 100) p
      join public.profiles pr on pr.account_id = p.author_id), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------------ the therapist portal

-- Everything the portal shows, in one reply. Clients appear as a pen name and an avatar only.
create or replace function public.my_portal() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  th private.therapists;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into th from private.therapists where id = tid;
  perform private.ensure_therapist_members(tid);
  return jsonb_build_object(
    'ok', true, 'therapist_id', th.id, 'paused', th.paused,
    'caps', jsonb_build_object('perDay', th.per_day, 'bufferMin', th.buffer_min, 'newPerWeek', th.new_per_week),
    'profile', jsonb_build_object('bio', th.bio, 'specialisations', th.specialisations, 'languages', th.languages, 'modes', th.modes, 'priceKes', th.price_kes),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('dow', a.dow, 'start', to_char(a.start_time, 'HH24:MI'), 'end', to_char(a.end_time, 'HH24:MI'), 'modes', a.modes) order by a.dow, a.start_time)
                              from private.therapist_availability a where a.therapist_id = tid and a.active), '[]'::jsonb),
    'time_off', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'start', (extract(epoch from o.start_at) * 1000)::bigint, 'end', (extract(epoch from o.end_at) * 1000)::bigint) order by o.start_at)
                          from private.therapist_time_off o where o.therapist_id = tid and not o.removed and o.end_at > now()), '[]'::jsonb),
    'payout', jsonb_build_object('method', th.payout_method, 'schedule', th.payout_schedule),
    'licence_valid_to', (extract(epoch from th.licence_valid_to) * 1000)::bigint,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'client_key', pr.public_key::text, 'client_name', pr.pen_name, 'client_avatar', pr.avatar, 'mode', s.mode,
        'start', (extract(epoch from s.start_at) * 1000)::bigint, 'end', (extract(epoch from s.end_at) * 1000)::bigint, 'number', s.n,
        'status', case when s.status in ('completed', 'missed') then 'completed' when s.started_at is not null then 'in-progress' else 'booked' end,
        'attendance', s.attendance, 'note', s.note,
        'follow_up', case when s.attendance is null then null else (extract(epoch from s.follow_up_offer) * 1000)::bigint end,
        'gross_kes', s.gross_kes) order by s.start_at)
      from (select x.*, row_number() over (partition by x.member_id order by x.start_at) as n from private.sessions x
            where x.therapist_id = tid and x.status in ('booked', 'completed', 'missed')) s
      join public.profiles pr on pr.account_id = s.member_id
      where s.start_at > now() - interval '120 days'), '[]'::jsonb),
    'threads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'client_name', pr.pen_name, 'client_avatar', pr.avatar,
        'unread', (select count(*) from public.messages x where x.conversation_id = c.id and x.kind = 'text' and x.sender_member is distinct from me.id and x.created_at > me.last_read_at)
                  + case when me.opened_at is null then 1 else 0 end,
        'closed', c.ended_at is not null or c.expires_at <= now(),
        'next_session', (select (extract(epoch from min(s2.start_at)) * 1000)::bigint from private.sessions s2 where s2.therapist_id = tid and s2.member_id = other.account_id and s2.status = 'booked' and s2.end_at > now()),
        'messages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'from', case when x.kind = 'system' then 'system' when x.sender_member = me.id then 'me' else 'them' end, 'text', x.body, 'at', x.created_at) order by x.created_at)
                              from (select * from public.messages y where y.conversation_id = c.id order by y.created_at desc limit 300) x), '[]'::jsonb)
      ) order by coalesce((select max(x.created_at) from public.messages x where x.conversation_id = c.id), c.created_at) desc)
      from public.conversation_members me
      join public.conversations c on c.id = me.conversation_id
      join public.conversation_members other on other.conversation_id = c.id and other.account_id <> uid
      join public.profiles pr on pr.account_id = other.account_id
      where me.account_id = uid and not me.hidden and c.kind = 'therapist' and c.therapist_id = tid), '[]'::jsonb),
    'concerns', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'session_id', k.session_id, 'danger', k.danger, 'type', k.type, 'detail', k.detail, 'at', (extract(epoch from k.created_at) * 1000)::bigint) order by k.created_at)
                          from private.concerns k where k.therapist_id = tid), '[]'::jsonb)
  );
end;
$$;

create or replace function public.portal_save_profile(p_bio text, p_specs text[], p_langs text[], p_modes text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  b text := btrim(coalesce(p_bio, ''));
  reasons text[];
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if char_length(b) < 20 then return private.fail('bio', 'Write a little more. A short bio helps members choose.'); end if;
  if char_length(b) > 1500 then return private.fail('bio', 'Keep the bio under 1,500 characters.'); end if;
  reasons := private.blocked_reasons(b);
  if cardinality(reasons) > 0 then return private.fail('blocked', 'Your bio can’t include contact details or links. ' || private.explain_block(reasons)); end if;
  if private.is_solicitation(b) then return private.fail('solicit', 'Describe how you work, not how to reach you outside Echo.'); end if;
  if p_specs is null or cardinality(p_specs) = 0 then return private.fail('spec', 'Choose at least one specialisation.'); end if;
  if p_langs is null or cardinality(p_langs) = 0 or not (p_langs <@ private.allowed_languages()) then return private.fail('lang', 'Choose at least one language.'); end if;
  if p_modes is null or cardinality(p_modes) = 0 or not (p_modes <@ array['chat', 'voice', 'video']) then return private.fail('modes', 'Choose at least one session type.'); end if;
  update private.therapists set bio = b, specialisations = p_specs, languages = p_langs, modes = p_modes where id = tid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_save_availability(p_blocks jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  blk jsonb;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then return private.fail('invalid', 'Send the weekly hours as a list.'); end if;
  for blk in select * from jsonb_array_elements(p_blocks) loop
    if (blk->>'dow')::int not between 0 and 6 or (blk->>'start')::time >= (blk->>'end')::time
       or not (array(select jsonb_array_elements_text(blk->'modes')) <@ array['chat', 'voice', 'video']) then
      return private.fail('invalid', 'One of the blocks isn’t valid.');
    end if;
  end loop;
  update private.therapist_availability set active = false where therapist_id = tid and active;
  insert into private.therapist_availability (therapist_id, dow, start_time, end_time, modes)
    select tid, (b->>'dow')::int, (b->>'start')::time, (b->>'end')::time, array(select jsonb_array_elements_text(b->'modes')) from jsonb_array_elements(p_blocks) b;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_set_paused(p_paused boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  update private.therapists set paused = coalesce(p_paused, false) where id = tid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_set_caps(p_per_day int default null, p_buffer int default null, p_new int default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if p_per_day is not null and p_per_day not between 1 and 10 then return private.fail('invalid', 'Sessions a day must be between 1 and 10.'); end if;
  if p_buffer is not null and p_buffer not between 0 and 60 then return private.fail('invalid', 'The buffer must be between 0 and 60 minutes.'); end if;
  if p_new is not null and p_new not between 0 and 15 then return private.fail('invalid', 'New clients a week must be between 0 and 15.'); end if;
  update private.therapists set per_day = coalesce(p_per_day, per_day), buffer_min = coalesce(p_buffer, buffer_min), new_per_week = coalesce(p_new, new_per_week) where id = tid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Time off closes those hours to new bookings and tells the clients who already have a session in them.
create or replace function public.portal_add_time_off(p_start timestamptz, p_end timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  th private.therapists;
  s record;
  conv uuid;
  n int := 0;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if p_end <= p_start then return private.fail('invalid', 'The end must be after the start.'); end if;
  select * into th from private.therapists where id = tid;
  insert into private.therapist_time_off (therapist_id, start_at, end_at) values (tid, p_start, p_end);
  for s in select * from private.sessions x where x.therapist_id = tid and x.status = 'booked' and x.start_at < p_end and x.end_at > p_start loop
    n := n + 1;
    select c.id into conv from public.conversations c join public.conversation_members m on m.conversation_id = c.id
      where m.account_id = s.member_id and c.kind = 'therapist' and c.therapist_id = tid and c.ended_at is null order by c.created_at desc limit 1;
    if conv is not null then
      perform private.say(conv, th.name || ' will be away at the time of your session on ' || to_char(s.start_at at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI') || '. You can move it to another time from Sessions.');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'notified', n);
end;
$$;

create or replace function public.portal_remove_time_off(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  update private.therapist_time_off set removed = true where id = p_id and therapist_id = tid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_join_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  s private.sessions;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into s from private.sessions where id = p_id and therapist_id = tid;
  if not found then return private.fail('gone', 'Session not found.'); end if;
  if s.status in ('completed', 'missed') then return private.fail('done', 'This session has ended.'); end if;
  if s.status <> 'booked' then return private.fail('gone', 'Session not found.'); end if;
  if s.started_at is null and (now() < s.start_at - interval '10 minutes' or now() >= s.end_at) then return private.fail('early', 'The session isn’t open yet. You can join 10 minutes before.'); end if;
  update private.sessions set started_at = coalesce(started_at, now()) where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_set_note(p_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  update private.sessions set note = left(coalesce(p_note, ''), 5000) where id = p_id and therapist_id = tid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Wrapping up records attendance and the note. A no-show is not paid here; it follows the late-change rule.
create or replace function public.portal_wrap_up(p_id uuid, p_attendance text, p_note text, p_follow_up timestamptz default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  s private.sessions;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if p_attendance not in ('attended', 'late', 'no-show') then return private.fail('invalid', 'Choose attended, late or no-show.'); end if;
  select * into s from private.sessions where id = p_id and therapist_id = tid and status = 'booked';
  if not found then return private.fail('gone', 'Session not found.'); end if;
  update private.sessions set
    status = case when p_attendance = 'no-show' then 'missed' else 'completed' end,
    attendance = p_attendance, note = left(coalesce(p_note, ''), 5000), follow_up_offer = p_follow_up,
    gross_kes = case when p_attendance = 'no-show' then null else s.price_kes end,
    end_at = least(s.end_at, now())
  where id = p_id;
  perform private.refresh_chat_expiry(s.member_id, tid);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_send(p_conversation uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  c public.conversations;
  me public.conversation_members;
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
  msg public.messages;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into c from public.conversations where id = p_conversation and kind = 'therapist' and therapist_id = tid;
  if not found then return private.fail('gone', 'That conversation is gone.'); end if;
  perform private.ensure_therapist_members(tid);
  select * into me from public.conversation_members where conversation_id = p_conversation and account_id = uid and not hidden;
  if not found then return private.fail('gone', 'That conversation is gone.'); end if;
  if c.ended_at is not null or c.expires_at <= now() then return private.fail('closed', 'This thread is closed.'); end if;
  if t = '' then return private.fail('empty', 'Write a message first.'); end if;
  if char_length(t) > private.max_message_length() then return private.fail('too-long', 'That message is too long. Try splitting it.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  insert into public.messages (conversation_id, sender_member, body) values (p_conversation, me.id, t) returning * into msg;
  update public.conversation_members set last_read_at = msg.created_at where id = me.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_close_thread(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  update public.conversations set ended_at = coalesce(ended_at, now()) where id = p_conversation and kind = 'therapist' and therapist_id = tid and ended_at is null;
  if found then perform private.say(p_conversation, 'This conversation has ended.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_offer_time(p_conversation uuid, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  nm text;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if not exists (select 1 from public.conversations where id = p_conversation and kind = 'therapist' and therapist_id = tid and ended_at is null) then return private.fail('gone', 'That conversation is gone.'); end if;
  select name into nm from private.therapists where id = tid;
  perform private.say(p_conversation, nm || ' offered a session on ' || to_char(p_start at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI') || '. You can book it from Echo.');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.portal_raise_concern(p_session uuid, p_danger boolean, p_type text, p_detail text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  cid uuid;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if p_type not in ('self-harm', 'harm-to-others', 'abuse', 'behaviour') then return private.fail('invalid', 'Choose what kind of concern this is.'); end if;
  if p_session is not null and not exists (select 1 from private.sessions where id = p_session and therapist_id = tid) then return private.fail('gone', 'Session not found.'); end if;
  insert into private.concerns (therapist_id, session_id, danger, type, detail) values (tid, p_session, coalesce(p_danger, false), p_type, left(btrim(coalesce(p_detail, '')), 3000)) returning id into cid;
  return jsonb_build_object('ok', true, 'id', cid);
end;
$$;

create or replace function public.portal_forum_reply(p_post uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
  cid uuid;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if not private.can_read_post(p_post, uid) or not exists (select 1 from private.posts where id = p_post and status = 'published') then return private.fail('gone', 'That post is gone.'); end if;
  if char_length(t) < 10 then return private.fail('short', 'Write a little more.'); end if;
  if char_length(t) > 2000 then return private.fail('too-long', 'That reply is too long.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  if private.is_solicitation(t) then return private.fail('solicit', 'Replies share general information. They can’t invite people to book with you or contact you.'); end if;
  if (select count(*) from private.comments where author_id = uid and created_at > now() - interval '1 hour') >= private.comments_per_hour() then return private.fail('rate', 'You’ve replied a lot in the last hour. Try again a little later.'); end if;
  insert into private.comments (post_id, author_id, body, therapist_id) values (p_post, uid, t, tid) returning id into cid;
  return jsonb_build_object('ok', true, 'comment_id', cid);
end;
$$;

-- Changing where money goes needs a fresh sign-in (the code check) in the last five minutes.
create or replace function public.portal_change_payout(p_method text, p_schedule text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  m text := btrim(coalesce(p_method, ''));
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  if p_schedule not in ('weekly', 'monthly') then return private.fail('invalid', 'Choose weekly or monthly.'); end if;
  if m = '' or char_length(m) > 80 then return private.fail('invalid', 'Enter where to send the money.'); end if;
  if not exists (select 1 from auth.users u where u.id = uid and u.last_sign_in_at > now() - interval '5 minutes') then return private.fail('reauth', 'Check it’s you first.'); end if;
  update private.therapists set payout_method = m, payout_schedule = p_schedule where id = tid;
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'my_portal()', 'portal_save_profile(text,text[],text[],text[])', 'portal_save_availability(jsonb)', 'portal_set_paused(boolean)', 'portal_set_caps(int,int,int)',
    'portal_add_time_off(timestamptz,timestamptz)', 'portal_remove_time_off(uuid)', 'portal_join_session(uuid)', 'portal_set_note(uuid,text)',
    'portal_wrap_up(uuid,text,text,timestamptz)', 'portal_send(uuid,text)', 'portal_close_thread(uuid)', 'portal_offer_time(uuid,timestamptz)',
    'portal_raise_concern(uuid,boolean,text,text)', 'portal_forum_reply(uuid,text)', 'portal_change_payout(text,text)'])
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema private from public, anon, authenticated;

select 'therapist portal ready' as status;
