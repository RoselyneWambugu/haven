-- The leader of a group chat removes a person from the room. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; gid text;
begin
  for i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471300007' || i, now(), now());
  end loop;
  -- 1 therapist (t-amina), 2 member A, 3 member B
  update private.therapists set account_id = ids[1] where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Peter Ochieng', date '1996-06-06', null, 'CedarFern', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[2], 'monthly', now() + interval '30 days', 'mpesa', 'F-1'), (ids[3], 'monthly', now() + interval '30 days', 'mpesa', 'F-2');
  select id into gid from private.group_chats where template_key = 'grief' and starts_at > now() and cancelled_at is null limit 1;
  update private.group_chats set facilitator_id = 't-amina' where id = gid;
  insert into private.group_members (group_id, account_id) values (gid, ids[2]), (gid, ids[3]);
  update private.group_chats set starts_at = now() - interval '5 minutes' where id = gid;

  -- A member cannot remove anyone; the leader can, once, with a reason.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_group_remove_member(gid, 'RiverMoss', 'Being unkind to others');
  if r->>'code' is distinct from 'not-therapist' then bad := array_append(bad, 'member removed someone: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_group_remove_member(gid, 'RiverMoss', 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'no reason accepted'); end if;
  r := public.portal_group_remove_member(gid, 'RiverMoss', 'Being unkind to others');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'remove: ' || r::text); end if;
  r := public.portal_group_remove_member(gid, 'RiverMoss', 'Being unkind to others');
  if r->>'code' is distinct from 'already' then bad := array_append(bad, 'removed twice'); end if;
  r := public.portal_group_remove_member(gid, 'NobodyHere', 'Not in this room');
  if r->>'code' is distinct from 'not-in-chat' then bad := array_append(bad, 'stranger removed: ' || r::text); end if;
  reset role;
  if (select removed_by from private.group_members where group_id = gid and account_id = ids[2]) is distinct from 'Facilitator ' || (select name from private.therapists where id = 't-amina') then bad := array_append(bad, 'removed_by not kept'); end if;

  -- The removed person cannot write or sign up again.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.group_send(gid, 'hello again');
  if r->>'code' is distinct from 'removed' then bad := array_append(bad, 'removed person can write: ' || r::text); end if;
  r := public.group_register(gid);
  if r->>'code' is distinct from 'removed' then bad := array_append(bad, 'removed person re-registered: ' || r::text); end if;
  reset role;

  -- Another therapist cannot remove people from this room.
  update private.therapists set account_id = ids[3] where id = 't-james';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_group_remove_member(gid, 'CedarFern', 'Trying to remove myself');
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'not the leader but allowed: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
