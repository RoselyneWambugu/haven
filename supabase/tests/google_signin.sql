-- Google sign-up checks. Always rolls back. A member with a confirmed email and no phone is refused with the "setup" message until
-- supabase/google_signin_setup.sql has been run; after it is run the same call creates the account (re-run this file then).
do $$
declare
  u uuid := gen_random_uuid();
  r jsonb; bad text[] := '{}';
  optional boolean := private.phone_optional();
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'g.member@example.com', now(), now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Google Member', date '1996-06-06', null, 'GoogleLeaf', 'moon', array['English'], array[]::text[], 'v1');
  if optional then
    if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'google register: ' || r::text); end if;
    r := public.my_account();
    if r->'private'->>'email' is distinct from 'g.member@example.com' then bad := array_append(bad, 'email not kept: ' || r::text); end if;
    if r->'private'->>'phone' is not null then bad := array_append(bad, 'phone should be null'); end if;
  else
    if r->>'code' is distinct from 'setup' then bad := array_append(bad, 'expected setup refusal: ' || r::text); end if;
  end if;
  reset role;

  -- A user with neither a phone nor a confirmed email is still refused.
  u := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconfirmed@example.com', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('No Proof', date '1996-06-06', null, 'NoProofLeaf', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'phone' then bad := array_append(bad, 'unconfirmed email accepted: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
