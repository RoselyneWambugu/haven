-- Timed, facilitated group chats on the server. A verified therapist leads each room. Members sign up, the room opens at the set time,
-- and the same contact-details filter as every chat applies. Moderators can remove people; staff schedule and cancel; a reported
-- message keeps its group. Nothing here uses delete or drop: the clean-up that erases old rooms is in supabase/group_chat_cleanup.sql,
-- which is run separately because it deletes.

create table if not exists private.group_templates (
  key text primary key,
  topic text not null,
  blurb text not null,
  facilitator_id text not null references private.therapists (id),
  weekday int not null check (weekday between 0 and 6),
  hour_eat int not null check (hour_eat between 0 and 23),
  duration_min int not null,
  capacity int not null
);
create table if not exists private.group_chats (
  id text primary key,
  template_key text,
  topic text not null,
  blurb text not null,
  facilitator_id text not null references private.therapists (id),
  starts_at timestamptz not null,
  duration_min int not null check (duration_min between 30 and 90),
  capacity int not null check (capacity between 4 and 20),
  created_by text,
  cancelled_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  closed_at timestamptz,
  retained_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists group_chats_start_idx on private.group_chats (starts_at);
create table if not exists private.group_members (
  group_id text not null references private.group_chats (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  registered_at timestamptz not null default now(),
  left_at timestamptz,
  removed_reason text,
  removed_by text,
  removed_at timestamptz,
  primary key (group_id, account_id)
);
create table if not exists private.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references private.group_chats (id) on delete cascade,
  account_id uuid references auth.users (id) on delete set null,
  therapist_id text references private.therapists (id),
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists group_messages_idx on private.group_messages (group_id, created_at);
alter table private.group_templates enable row level security;
alter table private.group_chats enable row level security;
alter table private.group_members enable row level security;
alter table private.group_messages enable row level security;

insert into private.group_templates (key, topic, blurb, facilitator_id, weekday, hour_eat, duration_min, capacity)
select v.key, v.topic, v.blurb, v.fid, v.wd, v.hr, v.dur, v.cap from (values
  ('grief', 'Surviving grief when everyone has moved on', 'The cards stopped arriving and people stopped asking. A gentle hour for anyone whose grief outlasted everyone else’s patience.', 't-amina', 2, 14, 60, 12),
  ('anxiety', 'Sunday-night anxiety: quieting the worry before the week', 'An evening check-in for the worry that arrives before Monday does.', 't-james', 0, 19, 45, 10),
  ('recovery', 'Staying on track: a recovery check-in', 'Where are you today? A no-shame hour for people working on alcohol, drugs or other habits.', 't-peter', 3, 18, 60, 12),
  ('burnout', 'Burnout and work stress: carrying it all', 'Exhausted, behind, and told to be grateful. Share how it feels and hear that you are not the only one.', 't-faith', 4, 20, 45, 10)
) as v(key, topic, blurb, fid, wd, hr, dur, cap)
where exists (select 1 from private.therapists t where t.id = v.fid)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- the rules of a room

create or replace function private.group_end(g private.group_chats) returns timestamptz
language sql immutable set search_path = ''
as $$ select g.starts_at + make_interval(mins => g.duration_min) $$;

-- upcoming, lobby (ten minutes before), open, ended or cancelled.
create or replace function private.group_status(g private.group_chats) returns text
language sql stable set search_path = ''
as $$
  select case when g.cancelled_at is not null then 'cancelled'
              when now() >= private.group_end(g) then 'ended'
              when now() >= g.starts_at then 'open'
              when now() >= g.starts_at - interval '10 minutes' then 'lobby'
              else 'upcoming' end
$$;

-- Makes sure every standing topic has a session to sign up for, and writes the closing note when a room ends.
create or replace function private.tick_groups() returns void
language plpgsql set search_path = ''
as $$
declare
  t private.group_templates;
  d date;
  g private.group_chats;
begin
  for t in select * from private.group_templates loop
    if exists (select 1 from private.group_chats c where c.template_key = t.key and c.cancelled_at is null and c.starts_at > now()) then continue; end if;
    if exists (select 1 from private.therapists th where th.id = t.facilitator_id and th.suspended) then continue; end if;
    d := private.today() + 1;
    while extract(dow from d)::int <> t.weekday loop d := d + 1; end loop;
    insert into private.group_chats (id, template_key, topic, blurb, facilitator_id, starts_at, duration_min, capacity)
      values ('gc-' || t.key || '-' || to_char(d, 'YYYYMMDD'), t.key, t.topic, t.blurb, t.facilitator_id, ((d + make_interval(hours => t.hour_eat))::timestamp at time zone 'Africa/Nairobi'), t.duration_min, t.capacity)
      on conflict (id) do nothing;
  end loop;
  for g in select * from private.group_chats c where c.closed_at is null and c.cancelled_at is null and now() >= private.group_end(c) loop
    insert into private.group_messages (group_id, kind, body, created_at)
      values (g.id, 'system', 'Thank you for being here. The room is closed. This chat is deleted 24 hours after it ends, unless a message in it was reported.', private.group_end(g));
    update private.group_chats set closed_at = now() where id = g.id;
  end loop;
end;
$$;
select cron.unschedule(jobid) from cron.job where jobname = 'echo-tick-groups';
select cron.schedule('echo-tick-groups', '*/5 * * * *', 'select private.tick_groups()');
select private.tick_groups();

-- ---------------------------------------------------------------- members

create or replace function private.group_json(g private.group_chats, uid uuid, p_with_messages boolean) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  me private.group_members;
  registered boolean;
  removed boolean;
  taken int;
  msgs jsonb := '[]'::jsonb;
  fac text;
begin
  select * into me from private.group_members where group_id = g.id and account_id = uid;
  registered := found and me.left_at is null and me.removed_at is null;
  removed := found and me.removed_at is not null;
  select count(*) into taken from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null and m.account_id <> uid;
  select name into fac from private.therapists where id = g.facilitator_id;
  if p_with_messages and registered then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'avatar', x.avatar, 'text', x.body, 'at', private.ms(x.created_at),
        'mine', x.account_id = uid, 'facilitator', x.therapist_id is not null, 'system', x.kind = 'system') order by x.created_at), '[]'::jsonb)
      into msgs
      from (select m.*, case when m.kind = 'system' then 'Echo' when m.therapist_id is not null then coalesce(fac, 'Facilitator') else coalesce(p.pen_name, 'Former member') end as name,
                   case when m.kind = 'system' then 'leaf' when m.therapist_id is not null then 'leaf' else coalesce(p.avatar::text, 'moon') end as avatar
            from private.group_messages m
            left join public.profiles p on p.account_id = m.account_id
            where m.group_id = g.id
              and (m.account_id is null or not exists (select 1 from private.group_members r where r.group_id = g.id and r.account_id = m.account_id and r.removed_at is not null))
            order by m.created_at desc limit 200) x;
  end if;
  return jsonb_build_object('id', g.id, 'topic', g.topic, 'blurb', g.blurb, 'facilitatorId', g.facilitator_id, 'startsAt', private.ms(g.starts_at),
    'durationMin', g.duration_min, 'capacity', g.capacity, 'takenOthers', taken, 'registered', registered, 'messages', msgs, 'posted', 0, 'closed', g.closed_at is not null,
    'cancelled', case when g.cancelled_at is null then null else jsonb_build_object('reason', g.cancelled_reason, 'by', 'Echo team', 'at', private.ms(g.cancelled_at)) end,
    'removed', case when removed then jsonb_build_array(jsonb_build_object('name', (select pen_name from public.profiles where account_id = uid), 'reason', '', 'by', 'A moderator', 'at', private.ms(me.removed_at))) else '[]'::jsonb end);
end;
$$;

create or replace function public.group_list() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'groups', coalesce((
    select jsonb_agg(private.group_json(g, uid, true) order by g.starts_at)
    from (select * from private.group_chats where starts_at > now() - interval '3 days' and starts_at < now() + interval '30 days' order by starts_at limit 40) g), '[]'::jsonb));
end;
$$;

create or replace function public.group_register(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  g private.group_chats;
  m private.group_members;
  taken int;
begin
  select * into g from private.group_chats where id = p_id for update;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  select * into m from private.group_members where group_id = g.id and account_id = uid;
  if found and m.removed_at is not null then return private.fail('removed', 'You were removed from this group chat.'); end if;
  if found and m.left_at is null then return jsonb_build_object('ok', true); end if;
  if not private.has_plan(uid) then return private.fail('plan', 'Group chats are part of a plan. Choose one to take part.'); end if;
  if g.cancelled_at is not null then return private.fail('cancelled', 'This group chat was cancelled.'); end if;
  if private.group_status(g) not in ('upcoming', 'lobby') then return private.fail('closed', 'This group chat has already started.'); end if;
  select count(*) into taken from private.group_members x where x.group_id = g.id and x.left_at is null and x.removed_at is null;
  if taken >= g.capacity then return private.fail('closed', 'This group chat is full.'); end if;
  insert into private.group_members (group_id, account_id) values (g.id, uid)
    on conflict (group_id, account_id) do update set left_at = null, registered_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.group_unregister(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.group_members set left_at = now() where group_id = p_id and account_id = uid and left_at is null and removed_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.group_send(p_id text, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  g private.group_chats;
  m private.group_members;
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
begin
  select * into g from private.group_chats where id = p_id;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  select * into m from private.group_members where group_id = g.id and account_id = uid;
  if not found or m.left_at is not null then return private.fail('not-registered', 'Sign up to take part.'); end if;
  if m.removed_at is not null then return private.fail('removed', 'You were removed from this group chat by a moderator.'); end if;
  if not private.has_plan(uid) then return private.fail('plan', 'Group chats are part of a plan. Choose one to take part.'); end if;
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  if private.group_status(g) <> 'open' then return private.fail('not-open', case private.group_status(g) when 'ended' then 'This group chat has ended.' else 'It hasn’t started yet.' end); end if;
  if t = '' then return private.fail('empty', 'Write a message first.'); end if;
  if char_length(t) > 500 then return private.fail('long', 'Please keep it under 500 characters.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  if (select count(*) from private.group_messages x where x.group_id = g.id and x.account_id = uid and x.created_at > now() - interval '1 minute') >= 20 then
    return private.fail('slow', 'You’re writing very fast. Take a breath.');
  end if;
  insert into private.group_messages (group_id, account_id, body) values (g.id, uid, t);
  return jsonb_build_object('ok', true);
end;
$$;

-- A reported message is kept with the room, along with the lines around it, so a reviewer can see what was happening.
create or replace function public.group_report(p_id text, p_message uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  g private.group_chats;
  msg private.group_messages;
  snap jsonb;
  nm text;
  prior int;
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other') then return private.fail('invalid', 'Choose a reason from the list.'); end if;
  select * into g from private.group_chats where id = p_id;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if not exists (select 1 from private.group_members where group_id = g.id and account_id = uid and left_at is null) then return private.fail('not-registered', 'You can report only in a room you are in.'); end if;
  select * into msg from private.group_messages where id = p_message and group_id = g.id;
  if not found or msg.kind <> 'text' or msg.account_id is null or msg.account_id = uid then return private.fail('invalid', 'That message can’t be reported.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', 'e' || (x.rn - 1), 'who', case when x.id = msg.id then 'reported' else 'reporter' end, 'text', x.text, 'reported', x.id = msg.id) order by x.created_at), '[]'::jsonb)
    into snap
    from (select row_number() over (order by m.created_at) as rn, m.id, m.created_at,
                 coalesce(p.pen_name, 'Facilitator') || ': ' || left(m.body, 300) as text
          from (select * from private.group_messages where group_id = g.id and kind = 'text' and created_at <= msg.created_at order by created_at desc limit 8) m
          left join public.profiles p on p.account_id = m.account_id) x;
  select pen_name into nm from public.profiles where account_id = msg.account_id;
  select count(*)::int into prior from private.reports where reported = msg.account_id;
  insert into private.reports (reporter, reported, reported_name, target, target_id, reason, note, snapshot, prior_reports)
    values (uid, msg.account_id, coalesce(nm, 'Reported member'), 'message', msg.id, p_reason, '', snap, prior);
  update private.group_chats set retained_at = coalesce(retained_at, now()) where id = g.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- the facilitator (therapist portal)

create or replace function public.portal_groups() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  return jsonb_build_object('ok', true, 'groups', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'topic', g.topic, 'blurb', g.blurb, 'startsAt', private.ms(g.starts_at), 'durationMin', g.duration_min, 'capacity', g.capacity,
      'status', private.group_status(g), 'registered', (select count(*) from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null),
      'messages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', case when x.kind = 'system' then 'Echo' when x.therapist_id is not null then 'You' else coalesce(p.pen_name, 'Former member') end,
                              'text', x.body, 'at', private.ms(x.created_at), 'mine', x.therapist_id is not null) order by x.created_at)
                            from (select * from private.group_messages where group_id = g.id order by created_at desc limit 200) x
                            left join public.profiles p on p.account_id = x.account_id
                            where x.account_id is null or not exists (select 1 from private.group_members r where r.group_id = g.id and r.account_id = x.account_id and r.removed_at is not null)), '[]'::jsonb)) order by g.starts_at)
    from private.group_chats g where g.facilitator_id = tid and g.cancelled_at is null and g.starts_at > now() - interval '3 days' and g.starts_at < now() + interval '30 days'), '[]'::jsonb));
end;
$$;

create or replace function public.portal_group_send(p_id text, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  g private.group_chats;
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into g from private.group_chats where id = p_id and facilitator_id = tid;
  if not found then return private.fail('gone', 'That group chat isn’t yours.'); end if;
  if private.group_status(g) not in ('lobby', 'open') then return private.fail('not-open', 'You can write once the room opens, ten minutes before the start.'); end if;
  if t = '' then return private.fail('empty', 'Write a message first.'); end if;
  if char_length(t) > 500 then return private.fail('long', 'Please keep it under 500 characters.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  insert into private.group_messages (group_id, therapist_id, body) values (g.id, tid, t);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- staff

create or replace function public.admin_groups() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'groups', coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'topic', g.topic, 'blurb', g.blurb, 'facilitatorId', g.facilitator_id, 'startsAt', private.ms(g.starts_at), 'durationMin', g.duration_min,
      'capacity', g.capacity, 'takenOthers', (select count(*) from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null),
      'registered', false, 'messages', '[]'::jsonb, 'posted', 0, 'closed', g.closed_at is not null, 'createdBy', g.created_by,
      'cancelled', case when g.cancelled_at is null then null else jsonb_build_object('reason', g.cancelled_reason, 'by', g.cancelled_by, 'at', private.ms(g.cancelled_at)) end,
      'roster', coalesce((select jsonb_agg(p.pen_name order by p.pen_name) from private.group_members m join public.profiles p on p.account_id = m.account_id where m.group_id = g.id and m.left_at is null and m.removed_at is null), '[]'::jsonb),
      'removed', coalesce((select jsonb_agg(jsonb_build_object('name', p.pen_name, 'reason', m.removed_reason, 'by', m.removed_by, 'at', private.ms(m.removed_at)) order by m.removed_at)
                           from private.group_members m join public.profiles p on p.account_id = m.account_id where m.group_id = g.id and m.removed_at is not null), '[]'::jsonb)) order by g.starts_at)
    from (select * from private.group_chats where starts_at > now() - interval '3 days' order by starts_at limit 100) g), '[]'::jsonb));
end;
$$;

create or replace function public.admin_schedule_group(p_topic text, p_blurb text, p_facilitator text, p_starts timestamptz, p_duration int, p_capacity int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  tp text := btrim(coalesce(p_topic, ''));
  bl text := btrim(coalesce(p_blurb, ''));
  gid text := 'gc-custom-' || replace(gen_random_uuid()::text, '-', '');
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins schedule group chats.'); end if;
  if char_length(tp) < 8 then return private.fail('invalid', 'Give it a topic of at least 8 characters.'); end if;
  if char_length(tp) > 90 then return private.fail('invalid', 'Keep the topic under 90 characters.'); end if;
  if char_length(bl) < 20 then return private.fail('invalid', 'Say what it is about in at least 20 characters.'); end if;
  if char_length(bl) > 300 then return private.fail('invalid', 'Keep the description under 300 characters.'); end if;
  if not exists (select 1 from private.therapists where id = p_facilitator and not suspended) then return private.fail('invalid', 'Pick a verified therapist who is not suspended to lead it.'); end if;
  if p_duration is null or p_duration not between 30 and 90 then return private.fail('invalid', 'A group chat runs 30 to 90 minutes.'); end if;
  if p_capacity is null or p_capacity not between 4 and 20 then return private.fail('invalid', 'A group chat has 4 to 20 places.'); end if;
  if p_starts is null or p_starts < now() + interval '60 minutes' then return private.fail('invalid', 'Schedule it at least an hour ahead, so people can sign up.'); end if;
  if exists (select 1 from private.group_chats o where o.facilitator_id = p_facilitator and o.cancelled_at is null
             and o.starts_at < p_starts + make_interval(mins => p_duration) and p_starts < o.starts_at + make_interval(mins => o.duration_min)) then
    return private.fail('invalid', 'That therapist is already leading a group chat at that time.');
  end if;
  insert into private.group_chats (id, topic, blurb, facilitator_id, starts_at, duration_min, capacity, created_by) values (gid, tp, bl, p_facilitator, p_starts, p_duration, p_capacity, s.name);
  perform private.staff_log(s, 'Scheduled group chat', tp);
  return jsonb_build_object('ok', true, 'id', gid);
end;
$$;

create or replace function public.admin_cancel_group(p_id text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  g private.group_chats;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins cancel group chats.'); end if;
  select * into g from private.group_chats where id = p_id for update;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if g.cancelled_at is not null then return private.fail('cancelled', 'It is already cancelled.'); end if;
  if private.group_status(g) in ('open', 'ended') then return private.fail('started', 'It has already started, so it can’t be cancelled.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  update private.group_chats set cancelled_at = now(), cancelled_by = s.name, cancelled_reason = btrim(p_reason) where id = g.id;
  perform private.staff_log(s, 'Cancelled group chat', g.topic, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_from_group(p_id text, p_pen_name text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  g private.group_chats;
  acct uuid;
  m private.group_members;
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Your role can’t remove people from a group chat.'); end if;
  select * into g from private.group_chats where id = p_id;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if private.group_status(g) not in ('open', 'lobby') then return private.fail('not-open', 'You can remove someone only while the chat is open.'); end if;
  select account_id into acct from public.profiles where lower(pen_name) = lower(coalesce(p_pen_name, ''));
  select * into m from private.group_members where group_id = g.id and account_id = acct;
  if acct is null or not found or m.left_at is not null then return private.fail('not-in-chat', 'That person isn’t in this chat.'); end if;
  if m.removed_at is not null then return private.fail('already', 'They are already removed.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  update private.group_members set removed_at = now(), removed_by = s.name, removed_reason = btrim(p_reason) where group_id = g.id and account_id = acct;
  perform private.staff_log(s, 'Removed person from group chat', g.topic || ': ' || p_pen_name, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.group_list(), public.group_register(text), public.group_unregister(text), public.group_send(text, text), public.group_report(text, uuid, text),
  public.portal_groups(), public.portal_group_send(text, text), public.admin_groups(), public.admin_schedule_group(text, text, text, timestamptz, int, int),
  public.admin_cancel_group(text, text), public.admin_remove_from_group(text, text, text) from public, anon;
grant execute on function public.group_list(), public.group_register(text), public.group_unregister(text), public.group_send(text, text), public.group_report(text, uuid, text),
  public.portal_groups(), public.portal_group_send(text, text), public.admin_groups(), public.admin_schedule_group(text, text, text, timestamptz, int, int),
  public.admin_cancel_group(text, text), public.admin_remove_from_group(text, text, text) to authenticated;
