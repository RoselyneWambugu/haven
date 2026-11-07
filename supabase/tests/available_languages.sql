-- The available languages: the default list, only an Admin adds to it, and the rules read it. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}';
begin
  for i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471900016' || i, now(), now());
  end loop;
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'M. Mod', 'moderator');

  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['Kikuyu'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'languages' then bad := array_append(bad, 'unlisted language accepted: ' || r::text); end if;
  r := public.app_config();
  if r->'languages' is distinct from '["English", "Kiswahili"]'::jsonb then bad := array_append(bad, 'members do not see the list: ' || coalesce(r->>'languages', 'null')); end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_add_language('Kikuyu');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator added a language'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_add_language('ke');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short name accepted'); end if;
  r := public.admin_add_language('kikuyu');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'lower-case name accepted'); end if;
  r := public.admin_add_language('Kik5yu');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'digits accepted'); end if;
  r := public.admin_add_language('english');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'duplicate accepted'); end if;
  r := public.admin_add_language('Kikuyu');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'add failed: ' || r::text); end if;
  r := public.admin_add_language('Kikuyu');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'added twice'); end if;
  r := public.admin_config();
  if r->'languages' is distinct from '["English", "Kiswahili", "Kikuyu"]'::jsonb then bad := array_append(bad, 'admin does not see it: ' || coalesce(r->>'languages', 'null')); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Added language' and target = 'Kikuyu' and actor = 'A. Admin') then bad := array_append(bad, 'not logged'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English', 'Kikuyu'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'member cannot choose the new language: ' || r::text); end if;
  r := public.update_profile(null, array['Sheng'], null, null);
  if r->>'code' is distinct from 'languages' then bad := array_append(bad, 'unlisted language accepted on update: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
