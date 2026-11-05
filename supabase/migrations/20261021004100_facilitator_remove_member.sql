-- The therapist who leads a group chat is also its moderator in the room: besides removing a single message, they can remove a person from it.
-- A removed person cannot come back to that room (the existing rule for removals), their lines disappear from what others see, and the removal
-- is kept with who did it and why, so Echo's own moderators can review it. Staff moderators can still remove people too.

create or replace function public.portal_group_remove_member(p_group text, p_pen_name text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  t private.therapists;
  g private.group_chats;
  acct uuid;
  m private.group_members;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into g from private.group_chats where id = p_group and facilitator_id = tid;
  if not found then return private.fail('gone', 'That group chat isn’t yours.'); end if;
  if private.group_status(g) not in ('lobby', 'open') then return private.fail('not-open', 'You can remove someone while the room is open.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'Say why, in a few words.'); end if;
  select account_id into acct from public.profiles where lower(pen_name) = lower(coalesce(p_pen_name, ''));
  select * into m from private.group_members where group_id = g.id and account_id = acct;
  if acct is null or not found or m.left_at is not null then return private.fail('not-in-chat', 'That person isn’t in this room.'); end if;
  if m.removed_at is not null then return private.fail('already', 'They are already removed.'); end if;
  select * into t from private.therapists where id = tid;
  update private.group_members set removed_at = now(), removed_by = 'Facilitator ' || t.name, removed_reason = btrim(p_reason)
    where group_id = g.id and account_id = acct;
  perform private.group_promote(g.id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_group_remove_member(text, text, text) from public, anon;
grant execute on function public.portal_group_remove_member(text, text, text) to authenticated;
