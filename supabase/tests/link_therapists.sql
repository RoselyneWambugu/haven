-- Checks for linking therapists from the dashboard. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; n uuid;
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (ids[1], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000071', now(), now()),
    (ids[2], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000072', now(), now());
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Link Clinical', 'clinical');
  update private.therapists set account_id = null, link_phone = null where id in ('t-amina', 't-james');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_link_therapist('t-amina', '0712000072');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'non-staff linked'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_link_therapist('t-amina', '12345');
  if r->>'code' is distinct from 'phone' then bad := array_append(bad, 'bad phone accepted'); end if;
  r := public.admin_link_therapist('t-amina', '+254 712 000 072');
  if r->>'ok' is distinct from 'true' or (r->>'pending')::boolean then bad := array_append(bad, ('existing user: ' || r::text)); end if;
  reset role;
  if (select account_id from private.therapists where id = 't-amina') is distinct from ids[2] then bad := array_append(bad, 'not linked to existing user'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_link_therapist('t-amina', '0712000072');
  if r->>'code' is distinct from 'linked' then bad := array_append(bad, 'double link'); end if;
  r := public.admin_link_therapist('t-james', '0712000072');
  if r->>'code' is distinct from 'taken' then bad := array_append(bad, ('same number twice: ' || r::text)); end if;
  r := public.admin_link_therapist('t-james', '0712000071');
  if r->>'code' is distinct from 'staff' then bad := array_append(bad, 'linked a staff number'); end if;
  r := public.admin_link_therapist('t-james', '0712000073');
  if r->>'ok' is distinct from 'true' or not (r->>'pending')::boolean then bad := array_append(bad, ('pending: ' || r::text)); end if;
  r := public.admin_therapist_links();
  if jsonb_array_length(r->'links') < 2 then bad := array_append(bad, 'links list'); end if;
  reset role;
  -- The first time that number signs in, the link is made.
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[3], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000073', now(), now());
  if (select account_id from private.therapists where id = 't-james') is distinct from ids[3] then bad := array_append(bad, 'pending link not made on sign-up'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_unlink_therapist('t-james', 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'unlink without reason'); end if;
  r := public.admin_unlink_therapist('t-james', 'Left the practice');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('unlink: ' || r::text)); end if;
  r := public.admin_unlink_therapist('t-james', 'Left the practice');
  if r->>'code' is distinct from 'none' then bad := array_append(bad, 'unlink twice'); end if;
  reset role;
  if not exists (select 1 from private.audit where action like 'Linked therapist%') then bad := array_append(bad, 'no audit row'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL LINK CHECKS PASSED';
end;
$$;
