-- Therapists schedule their own group chats. A verified therapist (not suspended, new clients not paused) can schedule a group chat they lead, edit it before it
-- opens, and cancel it before it starts, from the portal. The same rules apply as when staff schedule one: a plain title (no clinical words), 30 to 90
-- minutes, 4 to 20 places, at least an hour ahead, and not overlapping another room they lead. On top of that a therapist can have at most 3 upcoming
-- group chats at once. Every action is written to the audit log, and clinical reviewers and Admins can still edit or cancel any room.
-- Nothing here removes data.

create or replace function private.group_fields_problem(p_topic text, p_blurb text, p_starts timestamptz, p_duration int, p_capacity int) returns text
language plpgsql stable set search_path = ''
as $$
declare
  tp text := btrim(coalesce(p_topic, ''));
  bl text := btrim(coalesce(p_blurb, ''));
begin
  if char_length(tp) < 8 then return 'Give it a topic of at least 8 characters.'; end if;
  if char_length(tp) > 90 then return 'Keep the topic under 90 characters.'; end if;
  if private.clinical_title_words(tp) is not null then return 'Use plainer words in the title (“' || private.clinical_title_words(tp) || '” sounds clinical). Say what the hour feels like; the description can be more exact.'; end if;
  if char_length(bl) < 20 then return 'Say what it is about in at least 20 characters.'; end if;
  if char_length(bl) > 300 then return 'Keep the description under 300 characters.'; end if;
  if p_duration is null or p_duration not between 30 and 90 then return 'A group chat runs 30 to 90 minutes.'; end if;
  if p_capacity is null or p_capacity not between 4 and 20 then return 'A group chat has 4 to 20 places.'; end if;
  if p_starts is null or p_starts < now() + interval '60 minutes' then return 'Schedule it at least an hour ahead, so people can sign up.'; end if;
  return null;
end;
$$;

create or replace function public.portal_schedule_group(p_topic text, p_blurb text, p_starts timestamptz, p_duration int, p_capacity int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  t private.therapists;
  problem text;
  gid text := 'gc-custom-' || replace(gen_random_uuid()::text, '-', '');
begin
  select * into t from private.therapists where account_id = uid;
  if not found then return private.fail('not-therapist', 'This sign-in isn’t linked to a therapist account.'); end if;
  if t.suspended then return private.fail('suspended', 'Your account is suspended, so you can’t schedule a group chat.'); end if;
  if t.paused then return private.fail('paused', 'New clients are paused on your account, so you can’t schedule a group chat right now.'); end if;
  problem := private.group_fields_problem(p_topic, p_blurb, p_starts, p_duration, p_capacity);
  if problem is not null then return private.fail('invalid', problem); end if;
  if (select count(*) from private.group_chats o where o.facilitator_id = t.id and o.cancelled_at is null and o.starts_at + make_interval(mins => o.duration_min) > now()) >= 3 then
    return private.fail('limit', 'You already lead 3 upcoming group chats. Wait for one to finish, or cancel one, before scheduling another.');
  end if;
  if exists (select 1 from private.group_chats o where o.facilitator_id = t.id and o.cancelled_at is null
             and o.starts_at < p_starts + make_interval(mins => p_duration) and p_starts < o.starts_at + make_interval(mins => o.duration_min)) then
    return private.fail('invalid', 'You already lead a group chat at that time.');
  end if;
  insert into private.group_chats (id, topic, blurb, facilitator_id, starts_at, duration_min, capacity, created_by)
    values (gid, btrim(p_topic), btrim(p_blurb), t.id, p_starts, p_duration, p_capacity, t.name);
  insert into private.audit (actor, role, action, target, reason) values (t.name, 'therapist', 'Scheduled group chat', btrim(p_topic), '');
  return jsonb_build_object('ok', true, 'id', gid);
end;
$$;

-- Edit a room you lead before it opens. People already signed up keep their place; the room can't shrink below them.
create or replace function public.portal_edit_group(p_id text, p_topic text, p_blurb text, p_starts timestamptz, p_duration int, p_capacity int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  t private.therapists;
  g private.group_chats;
  problem text;
  taken int;
begin
  select * into t from private.therapists where account_id = uid;
  if not found then return private.fail('not-therapist', 'This sign-in isn’t linked to a therapist account.'); end if;
  select * into g from private.group_chats where id = p_id and facilitator_id = t.id for update;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if g.cancelled_at is not null or private.group_status(g) <> 'upcoming' then return private.fail('started', 'A room can be edited only before it opens.'); end if;
  problem := private.group_fields_problem(p_topic, p_blurb, p_starts, p_duration, p_capacity);
  if problem is not null then return private.fail('invalid', problem); end if;
  select count(*) into taken from private.group_members m where m.group_id = g.id and m.left_at is null and m.removed_at is null;
  if p_capacity < taken then return private.fail('invalid', taken || ' people are signed up, so it needs at least ' || taken || ' places.'); end if;
  if exists (select 1 from private.group_chats o where o.id <> g.id and o.facilitator_id = t.id and o.cancelled_at is null
             and o.starts_at < p_starts + make_interval(mins => p_duration) and p_starts < o.starts_at + make_interval(mins => o.duration_min)) then
    return private.fail('invalid', 'You already lead a group chat at that time.');
  end if;
  update private.group_chats set topic = btrim(p_topic), blurb = btrim(p_blurb), starts_at = p_starts, duration_min = p_duration, capacity = p_capacity where id = g.id;
  perform private.group_promote(g.id);
  insert into private.audit (actor, role, action, target, reason) values (t.name, 'therapist', 'Edited group chat', btrim(p_topic), case when p_starts <> g.starts_at then 'Moved to a new time' else '' end);
  return jsonb_build_object('ok', true);
end;
$$;

-- Cancel a room you lead before it starts. Anyone signed up is told, as when staff cancel one.
create or replace function public.portal_cancel_group(p_id text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  t private.therapists;
  g private.group_chats;
begin
  select * into t from private.therapists where account_id = uid;
  if not found then return private.fail('not-therapist', 'This sign-in isn’t linked to a therapist account.'); end if;
  select * into g from private.group_chats where id = p_id and facilitator_id = t.id for update;
  if not found then return private.fail('gone', 'That group chat isn’t here.'); end if;
  if g.cancelled_at is not null then return private.fail('cancelled', 'It is already cancelled.'); end if;
  if private.group_status(g) in ('open', 'ended') then return private.fail('started', 'It has already started, so it can’t be cancelled.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  update private.group_chats set cancelled_at = now(), cancelled_by = t.name, cancelled_reason = btrim(p_reason) where id = g.id;
  insert into private.audit (actor, role, action, target, reason) values (t.name, 'therapist', 'Cancelled group chat', g.topic, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_schedule_group(text, text, timestamptz, int, int), public.portal_edit_group(text, text, text, timestamptz, int, int), public.portal_cancel_group(text, text) from public, anon;
grant execute on function public.portal_schedule_group(text, text, timestamptz, int, int), public.portal_edit_group(text, text, text, timestamptz, int, int), public.portal_cancel_group(text, text) to authenticated;
