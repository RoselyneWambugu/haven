-- Launch checklist checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}';
begin
  for i in 1..2 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472400027' || i, now(), now());
  end loop;
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_launch();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator saw checklist'); end if;
  r := public.admin_launch_signoff('mpesa', true, 'done');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator signed off'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_launch();
  if (r->>'ready')::boolean then bad := array_append(bad, 'ready when it should not be'); end if;
  r := public.admin_launch_signoff('nonsense', true, 'checked it');
  if r->>'code' is distinct from 'item' then bad := array_append(bad, 'unknown item accepted'); end if;
  r := public.admin_launch_signoff('mpesa', true, 'x');
  if r->>'code' is distinct from 'note' then bad := array_append(bad, 'no note accepted'); end if;
  r := public.admin_launch_signoff('mpesa', true, 'Paid KES 10 and refunded it');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('signoff: ' || r::text)); end if;
  r := public.admin_launch();
  if not exists (select 1 from jsonb_array_elements(r->'items') e where e->>'id' = 'mpesa' and e->>'state' = 'ok') then bad := array_append(bad, 'signoff not shown'); end if;
  r := public.admin_launch_signoff('mpesa', false, '');
  r := public.admin_launch();
  if exists (select 1 from jsonb_array_elements(r->'items') e where e->>'id' = 'mpesa' and e->>'state' = 'ok') then bad := array_append(bad, 'reopen failed'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
