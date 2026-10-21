-- Analytics checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; reg_before int; reg_after int;
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (ids[1], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000131', now(), now()),
    (ids[2], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000132', now(), now());
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Analyst', 'billing');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_analytics();
  if r->>'code' is distinct from 'not-staff' then bad := array_append(bad, 'member read analytics'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_analytics();
  if jsonb_array_length(r->'days') <> 180 then bad := array_append(bad, ('days ' || jsonb_array_length(r->'days'))); end if;
  reg_before := (r->'days'->179->>'registered')::int;
  if (r->'days'->179) ? 'refunds' is not true or (r->'days'->179) ? 't' is not true then bad := array_append(bad, 'day keys'); end if;
  if jsonb_array_length(r->'cohorts') <> 8 then bad := array_append(bad, 'cohorts'); end if;
  if jsonb_array_length(r->'who'->'cells') <> 5 or jsonb_array_length(r->'who'->'cells'->0) <> 5 then bad := array_append(bad, 'who'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Counted Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_analytics();
  reg_after := (r->'days'->179->>'registered')::int;
  if reg_after <> reg_before + 1 then bad := array_append(bad, ('registered ' || reg_before || ' -> ' || reg_after)); end if;
  if (r->'days'->179->>'profiled')::int < 1 then bad := array_append(bad, 'profiled not counted'); end if;
  reset role;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL ANALYTICS CHECKS PASSED';
end;
$$;
