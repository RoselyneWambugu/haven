-- Group chat checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; gid text; gid2 text; mid uuid; n int;
begin
  for i in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471300016' || i, now(), now());
  end loop;
  -- 1 clinical, 2 moderator, 3 therapist (t-amina), 4 member A, 5 member B
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Clin', 'clinical'), (ids[2], 'M. Mod', 'moderator');
  update private.therapists set account_id = ids[3] where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Group A', date '1996-06-06', null, 'RiverStone', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Group B', date '1996-06-06', null, 'CedarLeaf', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;

  -- The four weekly rooms exist.
  select count(*) into n from private.group_chats where template_key is not null and starts_at > now() and cancelled_at is null;
  if n < 4 then bad := array_append(bad, 'weekly rooms: ' || n); end if;
  select id into gid from private.group_chats where template_key = 'grief' and starts_at > now() and cancelled_at is null limit 1;

  -- Registration needs a plan.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_register(gid);
  if r->>'code' is distinct from 'plan' then bad := array_append(bad, 'registered without plan'); end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[4], 'monthly', now() + interval '30 days', 'mpesa', 'G-1'), (ids[5], 'monthly', now() + interval '30 days', 'mpesa', 'G-2');
  set local role authenticated;
  r := public.group_register(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('register: ' || r::text)); end if;
  r := public.group_register(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'register twice'); end if;
  r := public.group_list();
  if not exists (select 1 from jsonb_array_elements(r->'groups') g where g->>'id' = gid and (g->>'registered')::boolean) then bad := array_append(bad, 'list registered'); end if;
  r := public.group_unregister(gid);
  r := public.group_register(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'register after leaving'); end if;

  -- Capacity.
  reset role; update private.group_chats set capacity = 4 where id = gid;
  insert into private.group_members (group_id, account_id) select gid, id from auth.users where id = any(ids[1:3]);
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_register(gid);
  if r->>'code' is distinct from 'closed' then bad := array_append(bad, ('full room: ' || r::text)); end if;
  reset role; update private.group_members set left_at = now() where group_id = gid and account_id = any(ids[1:3]);
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_register(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('B register: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;

  -- Not open yet: cannot write.
  r := public.group_send(gid, 'hello everyone');
  if r->>'code' is distinct from 'not-open' then bad := array_append(bad, ('send early: ' || r::text)); end if;

  -- Open the room.
  reset role; update private.group_chats set starts_at = now() - interval '5 minutes' where id = gid;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_register(gid);
  r := public.group_send(gid, 'hello everyone');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('send: ' || r::text)); end if;
  r := public.group_send(gid, 'call me on 0712345678 please');
  if r->>'code' is distinct from 'blocked' then bad := array_append(bad, ('phone not blocked: ' || r::text)); end if;
  r := public.group_send(gid, repeat('a', 501));
  if r->>'code' is distinct from 'long' then bad := array_append(bad, 'long'); end if;

  -- Facilitator writes through the portal.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_groups();
  if not exists (select 1 from jsonb_array_elements(r->'groups') g where g->>'id' = gid and g->>'status' = 'open') then bad := array_append(bad, ('portal_groups: ' || left(r::text, 200))); end if;
  r := public.portal_group_send(gid, 'Welcome. Take your time.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('facilitator send: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_group_send(gid, 'I am not a therapist');
  if r->>'code' is distinct from 'not-therapist' then bad := array_append(bad, 'member used portal'); end if;

  -- Member B (registered) sees A's message and reports it.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_list();
  select (m->>'id')::uuid into mid from jsonb_array_elements((select g->'messages' from jsonb_array_elements(r->'groups') g where g->>'id' = gid)) m where m->>'text' = 'hello everyone';
  if mid is null then bad := array_append(bad, 'B cannot see A message'); end if;
  if not exists (select 1 from jsonb_array_elements((select g->'messages' from jsonb_array_elements(r->'groups') g where g->>'id' = gid)) m where (m->>'facilitator')::boolean) then bad := array_append(bad, 'facilitator line missing'); end if;
  r := public.group_report(gid, mid, 'harassment');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('report: ' || r::text)); end if;
  reset role;
  if (select retained_at from private.group_chats where id = gid) is null then bad := array_append(bad, 'reported room not retained'); end if;

  -- Moderator removes A.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_groups();
  if not exists (select 1 from jsonb_array_elements(r->'groups') g where g->>'id' = gid and g->'roster' ? 'RiverStone') then bad := array_append(bad, ('roster: ' || left(r::text, 300))); end if;
  r := public.admin_remove_from_group(gid, 'RiverStone', 'abuse');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('remove: ' || r::text)); end if;
  r := public.admin_remove_from_group(gid, 'RiverStone', 'abuse again');
  if r->>'code' is distinct from 'already' then bad := array_append(bad, 'remove twice'); end if;
  r := public.admin_schedule_group('A topic long enough', 'A description that is long enough to pass', 't-amina', now() + interval '3 days', 60, 10);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator scheduled'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_send(gid, 'still here');
  if r->>'code' is distinct from 'removed' then bad := array_append(bad, ('removed can send: ' || r::text)); end if;
  r := public.group_register(gid);
  if r->>'code' is distinct from 'removed' then bad := array_append(bad, 'removed re-registered'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_list();
  if exists (select 1 from jsonb_array_elements((select g->'messages' from jsonb_array_elements(r->'groups') g where g->>'id' = gid)) m where m->>'text' = 'hello everyone') then bad := array_append(bad, 'removed member lines still visible'); end if;

  -- Clinical schedules and cancels.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_schedule_group('Short', 'A description that is long enough to pass', 't-amina', now() + interval '3 days', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short topic accepted'); end if;
  r := public.admin_schedule_group('A topic long enough', 'A description that is long enough to pass', 't-amina', now() + interval '10 minutes', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'too soon accepted'); end if;
  r := public.admin_schedule_group('A topic long enough', 'A description that is long enough to pass', 't-amina', now() + interval '3 days', 60, 10);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('schedule: ' || r::text)); end if;
  gid2 := r->>'id';
  r := public.admin_schedule_group('Another topic long', 'A description that is long enough to pass', 't-amina', now() + interval '3 days 30 minutes', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'facilitator overlap accepted'); end if;
  r := public.admin_cancel_group(gid2, 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'cancel without reason'); end if;
  r := public.admin_cancel_group(gid, 'Facilitator unwell');
  if r->>'code' is distinct from 'started' then bad := array_append(bad, 'cancelled an open room'); end if;
  r := public.admin_cancel_group(gid2, 'Facilitator unwell');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('cancel: ' || r::text)); end if;

  -- The room closes after it ends, once.
  reset role; update private.group_chats set starts_at = now() - interval '2 hours' where id = gid;
  perform private.tick_groups(); perform private.tick_groups();
  select count(*) into n from private.group_messages where group_id = gid and kind = 'system';
  if n <> 1 then bad := array_append(bad, 'closing lines: ' || n); end if;
  if (select closed_at from private.group_chats where id = gid) is null then bad := array_append(bad, 'not closed'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
