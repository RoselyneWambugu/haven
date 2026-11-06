-- A member edits their full name and contact email. Always rolls back.
do $$
declare
  uid uuid := gen_random_uuid(); r jsonb; bad text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254719000151', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  update private.identities set id_verified = true where account_id = uid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.update_my_details('A', null);
  if r->>'code' is distinct from 'name' then bad := array_append(bad, 'one-letter name accepted'); end if;
  r := public.update_my_details('Amina Wairimu', 'not an email');
  if r->>'code' is distinct from 'email' then bad := array_append(bad, 'bad email accepted'); end if;
  r := public.update_my_details('Amina River Moss', null);
  if r->>'code' is distinct from 'name' or r->>'error' not like '%pen name%' then bad := array_append(bad, 'name with pen name part accepted: ' || r::text); end if;
  r := public.update_my_details('Amina Njeri Wairimu', 'amina@example.com');
  if r->>'ok' is distinct from 'true' or (r->>'id_verified') <> 'false' then bad := array_append(bad, 'edit failed: ' || r::text); end if;
  reset role;
  if (select full_name from private.identities where account_id = uid) <> 'Amina Njeri Wairimu' or (select email from private.identities where account_id = uid) <> 'amina@example.com' or (select id_verified from private.identities where account_id = uid) then bad := array_append(bad, 'not saved as expected'); end if;
  if (select date_of_birth from private.identities where account_id = uid) <> date '1996-06-06' then bad := array_append(bad, 'date of birth changed'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.update_my_details('Amina Njeri Wairimu', '  ');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'clearing the email failed: ' || r::text); end if;
  reset role;
  -- an email that is the way in cannot be edited here
  update auth.users set email = 'amina@example.com', email_confirmed_at = now() where id = uid;
  update private.identities set email = 'amina@example.com' where account_id = uid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.update_my_details('Amina Njeri Wairimu', 'other@example.com');
  if r->>'code' is distinct from 'sign-in-email' then bad := array_append(bad, 'sign-in email edited: ' || r::text); end if;
  r := public.update_my_details('Amina N Wairimu', 'amina@example.com');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'name edit with a sign-in email failed: ' || r::text); end if;
  reset role;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
