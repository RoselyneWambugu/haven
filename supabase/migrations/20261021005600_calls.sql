-- Real voice and video sessions (Daily). The edge function call-join creates a private Daily room for the session and a meeting token for the person who asks,
-- after this function says they may join. Only the member who booked the session and the therapist it is with can get in; the room opens 10 minutes before the
-- start and closes at the end; nobody can record; the camera starts off (pen name and avatar shown, never a face unless the person turns it on).
-- Joining the call is joining the session: it records when the member joined (so a no-show can't be marked for someone who was there) and when the
-- therapist started (so a member can't report a therapist who was there as late).
-- Nothing here removes data.

alter table private.sessions add column if not exists call_room text;

create or replace function public.call_context(p_session uuid, p_account uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.sessions;
  tid text := private.therapist_of(p_account);
  is_member boolean;
  is_therapist boolean;
  who text;
begin
  select * into s from private.sessions where id = p_session;
  if not found then return private.fail('gone', 'That session can’t be found.'); end if;
  is_member := s.member_id = p_account;
  is_therapist := tid is not null and s.therapist_id = tid;
  if not is_member and not is_therapist then return private.fail('gone', 'That session can’t be found.'); end if;
  if s.mode = 'chat' then return private.fail('chat', 'This session is a chat. Open it from Chats.'); end if;
  if s.mode = 'video' and not private.flag('therapistVideo') then return private.fail('off', 'Video sessions aren’t offered right now.'); end if;
  if s.status <> 'booked' then return private.fail('gone', 'This session has ended or was cancelled.'); end if;
  if now() < s.start_at - interval '10 minutes' then return private.fail('early', 'The session opens 10 minutes before it starts.'); end if;
  if now() >= s.end_at then return private.fail('late', 'This session has ended.'); end if;
  if is_member then
    select pr.pen_name into who from public.profiles pr where pr.account_id = p_account;
    update private.sessions set member_joined_at = coalesce(member_joined_at, now()) where id = p_session;
  else
    select t.name into who from private.therapists t where t.id = tid;
    update private.sessions set started_at = coalesce(started_at, now()) where id = p_session;
  end if;
  update private.sessions set call_room = coalesce(call_room, 'echo-' || replace(p_session::text, '-', '')) where id = p_session;
  return jsonb_build_object('ok', true, 'room', 'echo-' || replace(p_session::text, '-', ''), 'mode', s.mode, 'name', coalesce(who, 'Echo'),
    'is_therapist', is_therapist, 'start', private.ms(s.start_at), 'end', private.ms(s.end_at));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.call_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.call_context(uuid, uuid) to service_role;
