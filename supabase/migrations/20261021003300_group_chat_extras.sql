-- Group chat extras: a facilitator or moderator removes a single message, clinical reviewers and Admins edit a scheduled room,
-- and a full room has a waiting list. Nothing here uses delete or drop: a removed message is hidden and kept for review, and a waiting
-- list entry is marked left or promoted.

alter table private.group_messages add column if not exists hidden_at timestamptz;
alter table private.group_messages add column if not exists hidden_by text;

create table if not exists private.group_waitlist (
  group_id text not null references private.group_chats (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  promoted_at timestamptz,
  primary key (group_id, account_id)
);
create index if not exists group_waitlist_account_idx on private.group_waitlist (account_id);
alter table private.group_waitlist enable row level security;

-- Hidden messages are not shown to members, to the facilitator's view, or reported again.
select private.patch_function('private.group_json(private.group_chats, uuid, boolean)'::regprocedure,
  'where m\.group_id = g\.id\r?\n\s+and \(m\.account_id is null', 'where m.group_id = g.id and m.hidden_at is null
              and (m.account_id is null', 'm.hidden_at is null');
select private.patch_function('public.portal_groups()'::regprocedure,
  'from private\.group_messages where group_id = g\.id order by created_at desc limit 200', 'from private.group_messages where group_id = g.id and hidden_at is null order by created_at desc limit 200', 'hidden_at is null');
select private.patch_function('public.group_report(text, uuid, text)'::regprocedure,
  'from private\.group_messages where id = p_message and group_id = g\.id;', 'from private.group_messages where id = p_message and group_id = g.id and hidden_at is null;', 'hidden_at is null');
-- A member also learns whether they are on the waiting list.
select private.patch_function('private.group_json(private.group_chats, uuid, boolean)'::regprocedure,
  '''registered'', registered, ''messages'', msgs,', '''registered'', registered, ''waitlisted'', exists (select 1 from private.group_waitlist w where w.group_id = g.id and w.account_id = uid and w.left_at is null and w.promoted_at is null), ''messages'', msgs,', '''waitlisted''');

create or replace function public.portal_group_remove_message(p_group text, p_message uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  g private.group_chats;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into g from private.group_chats where id = p_group and facilitator_id = tid;
  if not found then return private.fail('gone', 'That group chat isn’t yours.'); end if;
  if private.group_status(g) not in ('lobby', 'open') then return private.fail('not-open', 'You can remove a message while the room is open.'); end if;
  update private.group_messages set hidden_at = now(), hidden_by = 'Facilitator' where id = p_message and group_id = g.id and kind = 'text' and account_id is not null and hidden_at is null;
  if not found then return private.fail('gone', 'That message can’t be removed.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_group_message(p_group text, p_message uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  g private.group_chats;
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Your role can’t remove messages.'); end if;
  select * into g from private.group_chats where id = p_group;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  update private.group_messages set hidden_at = now(), hidden_by = s.name where id = p_message and group_id = g.id and kind = 'text' and account_id is not null and hidden_at is null;
  if not found then return private.fail('gone', 'That message can’t be removed.'); end if;
  perform private.staff_log(s, 'Removed a group chat message', g.topic, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- Edit a room before it opens. People already signed up keep their place; the room can't shrink below them.
create or replace function public.admin_edit_group(p_id text, p_topic text, p_blurb text, p_starts timestamptz, p_duration int, p_capacity int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  g private.group_chats;
  tp text := btrim(coalesce(p_topic, ''));
  bl text := btrim(coalesce(p_blurb, ''));
  taken int;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins edit group chats.'); end if;
  select * into g from private.group_chats where id = p_id for update;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if g.cancelled_at is not null or private.group_status(g) <> 'upcoming' then return private.fail('started', 'A room can be edited only before it opens.'); end if;
  if char_length(tp) < 8 then return private.fail('invalid', 'Give it a topic of at least 8 characters.'); end if;
  if char_length(tp) > 90 then return private.fail('invalid', 'Keep the topic under 90 characters.'); end if;
  if char_length(bl) < 20 then return private.fail('invalid', 'Say what it is about in at least 20 characters.'); end if;
  if char_length(bl) > 300 then return private.fail('invalid', 'Keep the description under 300 characters.'); end if;
  if p_duration is null or p_duration not between 30 and 90 then return private.fail('invalid', 'A group chat runs 30 to 90 minutes.'); end if;
  if p_capacity is null or p_capacity not between 4 and 20 then return private.fail('invalid', 'A group chat has 4 to 20 places.'); end if;
  if p_starts is null or p_starts < now() + interval '60 minutes' then return private.fail('invalid', 'Schedule it at least an hour ahead, so people can sign up.'); end if;
  select count(*) into taken from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null;
  if p_capacity < taken then return private.fail('invalid', taken || ' people are signed up, so it needs at least ' || taken || ' places.'); end if;
  if exists (select 1 from private.group_chats o where o.id <> g.id and o.facilitator_id = g.facilitator_id and o.cancelled_at is null
             and o.starts_at < p_starts + make_interval(mins => p_duration) and p_starts < o.starts_at + make_interval(mins => o.duration_min)) then
    return private.fail('invalid', 'That therapist is already leading a group chat at that time.');
  end if;
  update private.group_chats set topic = tp, blurb = bl, starts_at = p_starts, duration_min = p_duration, capacity = p_capacity where id = g.id;
  perform private.group_promote(g.id);
  perform private.staff_log(s, 'Edited group chat', tp, case when p_starts <> g.starts_at then 'Moved to a new time' else '' end);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- the waiting list

-- Fills free places from the waiting list, in order, for people who still have a plan and haven't been removed.
create or replace function private.group_promote(p_group text) returns void
language plpgsql set search_path = ''
as $$
declare
  g private.group_chats;
  taken int;
  w private.group_waitlist;
begin
  select * into g from private.group_chats where id = p_group;
  if not found or g.cancelled_at is not null or private.group_status(g) not in ('upcoming', 'lobby') then return; end if;
  loop
    select count(*) into taken from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null;
    exit when taken >= g.capacity;
    select * into w from private.group_waitlist x where x.group_id = g.id and x.left_at is null and x.promoted_at is null
      and private.has_plan(x.account_id)
      and not exists (select 1 from private.group_members r where r.group_id = g.id and r.account_id = x.account_id and r.removed_at is not null)
      order by x.joined_at limit 1;
    exit when not found;
    insert into private.group_members (group_id, account_id) values (g.id, w.account_id)
      on conflict (group_id, account_id) do update set left_at = null, registered_at = now();
    update private.group_waitlist set promoted_at = now() where group_id = g.id and account_id = w.account_id;
  end loop;
end;
$$;

create or replace function public.group_waitlist_join(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  g private.group_chats;
  taken int;
begin
  select * into g from private.group_chats where id = p_id for update;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('plan', 'Group chats are part of a plan. Choose one to take part.'); end if;
  if g.cancelled_at is not null or private.group_status(g) not in ('upcoming', 'lobby') then return private.fail('closed', 'This group chat has already started.'); end if;
  if exists (select 1 from private.group_members m where m.group_id = g.id and m.account_id = uid and m.removed_at is not null) then return private.fail('removed', 'You were removed from this group chat.'); end if;
  if exists (select 1 from private.group_members m where m.group_id = g.id and m.account_id = uid and m.left_at is null and m.removed_at is null) then return private.fail('registered', 'You already have a place.'); end if;
  select count(*) into taken from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null;
  if taken < g.capacity then return private.fail('open', 'There is a place free. Sign up instead.'); end if;
  insert into private.group_waitlist (group_id, account_id) values (g.id, uid)
    on conflict (group_id, account_id) do update set left_at = null, promoted_at = null, joined_at = clock_timestamp();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.group_waitlist_leave(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.group_waitlist set left_at = now() where group_id = p_id and account_id = uid and left_at is null and promoted_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Giving up a place, or being removed, offers it to the next person waiting.
create or replace function public.group_unregister(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.group_members set left_at = now() where group_id = p_id and account_id = uid and left_at is null and removed_at is null;
  perform private.group_promote(p_id);
  return jsonb_build_object('ok', true);
end;
$$;

select private.patch_function('public.admin_remove_from_group(text, text, text)'::regprocedure,
  'perform private\.staff_log\(s, ''Removed person from group chat''', 'perform private.group_promote(g.id);
  perform private.staff_log(s, ''Removed person from group chat''', 'private.group_promote(g.id)');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_group_remove_message(text, uuid), public.admin_remove_group_message(text, uuid, text), public.admin_edit_group(text, text, text, timestamptz, int, int),
  public.group_waitlist_join(text), public.group_waitlist_leave(text), public.group_unregister(text) from public, anon;
grant execute on function public.portal_group_remove_message(text, uuid), public.admin_remove_group_message(text, uuid, text), public.admin_edit_group(text, text, text, timestamptz, int, int),
  public.group_waitlist_join(text), public.group_waitlist_leave(text), public.group_unregister(text) to authenticated;
