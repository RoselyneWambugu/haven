-- Linking checks. Always rolls back. A member who signed up by phone later confirms an email (as when Google or a password is added);
-- the sync copies it into Echo's private record. A number already on another account is refused.
do $$
declare
  a uuid := gen_random_uuid();
  r jsonb; bad text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, created_at, updated_at)
    values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254713000051', now(), now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  r := public.my_account();
  if coalesce(r->'private'->>'email', '') <> '' then bad := array_append(bad, 'email should start empty'); end if;
  reset role;
  update auth.users set email = 'link.tester@example.com', email_confirmed_at = now() where id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.sync_sign_in_methods();
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'sync: ' || r::text); end if;
  r := public.my_account();
  if r->'private'->>'email' is distinct from 'link.tester@example.com' then bad := array_append(bad, 'email not copied: ' || r::text); end if;
  if r->'private'->>'phone' is distinct from '+254713000051' then bad := array_append(bad, 'phone changed: ' || r::text); end if;
  -- Running it again changes nothing.
  r := public.sync_sign_in_methods();
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'sync twice: ' || r::text); end if;
  reset role;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
