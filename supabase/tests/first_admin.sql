-- Checks for creating the first Admin. Always rolls back. Needs a project with no active Admin yet.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; i int;
begin
  if private.active_admins() > 0 then raise exception 'SKIPPED: an Admin already exists'; end if;
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (ids[1], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000091', now(), now()),
    (ids[2], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000092', now(), now());
  insert into private.setup (id, code_hash) values (1, encode(sha256(convert_to('ABCD1234EFGH5678', 'utf8')), 'hex'))
    on conflict (id) do update set code_hash = excluded.code_hash, attempts = 0, used_at = null;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.setup_open();
  if (r->>'open')::boolean is distinct from true then bad := array_append(bad, 'setup not open'); end if;
  r := public.claim_first_admin('First Admin', 'WRONGWRONG');
  if r->>'code' is distinct from 'code' then bad := array_append(bad, ('wrong code: ' || r::text)); end if;
  r := public.claim_first_admin('FA', 'ABCD-1234-EFGH-5678');
  if r->>'code' is distinct from 'name' then bad := array_append(bad, ('short name: ' || r::text)); end if;
  r := public.claim_first_admin('First Admin', 'abcd-1234-efgh-5678');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('claim: ' || r::text)); end if;
  r := public.staff_me();
  if r->>'role' is distinct from 'admin' then bad := array_append(bad, 'not an admin after claim'); end if;
  r := public.setup_open();
  if (r->>'open')::boolean then bad := array_append(bad, 'setup still open'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.claim_first_admin('Second Admin', 'ABCD1234EFGH5678');
  if r->>'code' is distinct from 'closed' then bad := array_append(bad, ('claimed twice: ' || r::text)); end if;
  -- Locking after 5 wrong tries.
  reset role;
  update private.staff set active = false where role = 'admin';
  update private.setup set used_at = null, attempts = 0 where id = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  for i in 1..5 loop r := public.claim_first_admin('Second Admin', 'NOPE' || i); end loop;
  r := public.claim_first_admin('Second Admin', 'ABCD1234EFGH5678');
  if r->>'code' is distinct from 'locked' then bad := array_append(bad, ('not locked: ' || r::text)); end if;
  r := public.setup_open();
  if (r->>'open')::boolean then bad := array_append(bad, 'open while locked'); end if;
  reset role; set local role anon;
  begin perform public.setup_open(); bad := array_append(bad, 'anon called setup_open'); exception when others then null; end;
  reset role;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL FIRST ADMIN CHECKS PASSED';
end;
$$;
