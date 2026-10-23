-- Group chat extras checks (waiting list, editing a room, removing a message). Always rolls back.
-- Run after supabase/tests/group_chats.sql has shown the base behaviour. See the file's neighbours for the same set-up pattern.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; gid text; mid uuid; mid2 uuid; n int;
begin
  for i in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472700030' || i, now(), now());
  end loop;
  -- 1 clinical, 2 moderator, 3 therapist (t-amina), 4 member A, 5 member B
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Clin', 'clinical'), (ids[2], 'M. Mod', 'moderator');
  update private.therapists set account_id = ids[3] where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Ext A', date '1996-06-06', null, 'RiverStone', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Ext B', date '1996-06-06', null, 'CedarLeaf', 'sun', array['English'], array[]::text[], 'v1');
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[4], 'monthly', now() + interval '30 days', 'mpesa', 'E-1'), (ids[5], 'monthly', now() + interval '30 days', 'mpesa', 'E-2');
  select id into gid from private.group_chats where template_key = 'grief' and starts_at > now() and cancelled_at is null limit 1;
  update private.group_chats set capacity = 4 where id = gid;
  insert into private.group_members (group_id, account_id) select gid, id from auth.users where id = any(ids[1:3]);

  -- A takes the last place; B finds it full and joins the waiting list.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_register(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('A register: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_waitlist_join(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('waitlist join: ' || r::text)); end if;
  r := public.group_list();
  if not exists (select 1 from jsonb_array_elements(r->'groups') g where g->>'id' = gid and (g->>'waitlisted')::boolean) then bad := array_append(bad, 'not shown as waitlisted'); end if;
  r := public.group_waitlist_join(gid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'joining twice failed'); end if;

  -- A gives up the place: B is promoted.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_unregister(gid);
  reset role;
  if not exists (select 1 from private.group_members where group_id = gid and account_id = ids[5] and left_at is null and removed_at is null) then bad := array_append(bad, 'waiting person not promoted'); end if;
  if (select promoted_at from private.group_waitlist where group_id = gid and account_id = ids[5]) is null then bad := array_append(bad, 'promotion not recorded'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_list();
  if not exists (select 1 from jsonb_array_elements(r->'groups') g where g->>'id' = gid and (g->>'registered')::boolean and not (g->>'waitlisted')::boolean) then bad := array_append(bad, 'B not registered in list'); end if;

  -- Edit: not below the signed up count, moved at least an hour ahead.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_edit_group(gid, 'A new topic that is long enough', 'A description that is long enough to pass the check', now() + interval '3 days', 60, 10);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator edited'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_edit_group(gid, 'A new topic that is long enough', 'A description that is long enough to pass the check', now() + interval '3 days', 60, 3);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, ('shrunk below signed up: ' || r::text)); end if;
  r := public.admin_edit_group(gid, 'Short', 'A description that is long enough to pass the check', now() + interval '3 days', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short topic'); end if;
  r := public.admin_edit_group(gid, 'A new topic that is long enough', 'A description that is long enough to pass the check', now() + interval '10 minutes', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'too soon'); end if;
  r := public.admin_edit_group(gid, 'A new topic that is long enough', 'A description that is long enough to pass the check', now() + interval '3 days', 45, 10);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('edit: ' || r::text)); end if;
  reset role;
  if (select topic from private.group_chats where id = gid) <> 'A new topic that is long enough' or (select capacity from private.group_chats where id = gid) <> 10 then bad := array_append(bad, 'edit not saved'); end if;

  -- Open the room, write two lines, and remove one as the facilitator and one as a moderator.
  update private.group_chats set starts_at = now() - interval '5 minutes' where id = gid;
  insert into private.group_messages (group_id, account_id, body) values (gid, ids[5], 'first line from B') returning id into mid;
  insert into private.group_messages (group_id, account_id, body) values (gid, ids[5], 'second line from B') returning id into mid2;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_group_remove_message(gid, mid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('facilitator remove: ' || r::text)); end if;
  r := public.portal_group_remove_message(gid, mid);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'removed twice'); end if;
  r := public.portal_groups();
  select count(*) into n from jsonb_array_elements((select g->'messages' from jsonb_array_elements(r->'groups') g where g->>'id' = gid)) m where m->>'text' like '%line from B';
  if n <> 1 then bad := array_append(bad, 'facilitator still sees removed line: ' || n); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_remove_group_message(gid, mid2, 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'no reason accepted'); end if;
  r := public.admin_remove_group_message(gid, mid2, 'Unkind to another member');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('moderator remove: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_list();
  select count(*) into n from jsonb_array_elements((select g->'messages' from jsonb_array_elements(r->'groups') g where g->>'id' = gid)) m where m->>'text' like '%line from B';
  if n <> 0 then bad := array_append(bad, 'members still see removed lines: ' || n); end if;
  r := public.group_report(gid, mid, 'harassment');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, ('reported a removed line: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.group_messages where id = mid and hidden_at is not null) then bad := array_append(bad, 'removed line not kept'); end if;
  if not exists (select 1 from private.audit where action = 'Removed a group chat message') then bad := array_append(bad, 'moderator removal not logged'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
