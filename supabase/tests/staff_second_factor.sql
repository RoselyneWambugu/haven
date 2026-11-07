-- Staff second factor: without an authenticator code (aal2) the server refuses every staff action.
-- One transaction that always ends in an error, so nothing is kept. Success: the error text is "ALL PASSED (rolled back)".
do $$
declare
  adm uuid := gen_random_uuid(); mem uuid := gen_random_uuid();
  r jsonb; bad text[] := '{}'; n int := 70; u uuid;
begin
  foreach u in array array[adm, mem] loop
    n := n + 1;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2547120000' || n, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
    r := public.register_member('Test Person', date '1995-05-05', null, 'Pen' || n, 'moon', array['English'], array[]::text[], 'v1');
    reset role;
  end loop;
  insert into private.staff (account_id, name, role, heavy) values (adm, 'A. Admin', 'admin', false);

  -- signed in with a password or phone code only (aal1): identified, but told to enter the code, and every staff action refused
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  r := public.staff_me();
  if r->>'code' is distinct from 'mfa' then bad := bad || ('aal1 staff_me: ' || r::text); end if;
  r := public.admin_state();
  if r->>'ok' = 'true' then bad := bad || 'admin_state opened at aal1'; end if;
  r := public.admin_remove_post(gen_random_uuid(), 'Breaks the guidelines');
  if r->>'code' is distinct from 'role' then bad := bad || ('remove at aal1: ' || r::text); end if;
  if public.can_review_documents() then bad := bad || 'documents open at aal1'; end if;
  reset role;

  -- no level at all (an old session) is the same as aal1
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.staff_me();
  if r->>'code' is distinct from 'mfa' then bad := bad || ('no aal staff_me: ' || r::text); end if;
  reset role;

  -- with the code (aal2) the dashboard opens
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.staff_me();
  if r->>'ok' is distinct from 'true' or r->>'role' <> 'admin' then bad := bad || ('aal2 staff_me: ' || r::text); end if;
  r := public.admin_state();
  if r->>'ok' is distinct from 'true' then bad := bad || ('admin_state at aal2: ' || r::text); end if;
  reset role;

  -- a member who is not staff is still "not staff", at any level
  perform set_config('request.jwt.claims', json_build_object('sub', mem, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.staff_me();
  if r->>'code' is distinct from 'not-staff' then bad := bad || ('member: ' || r::text); end if;
  reset role;

  if array_length(bad, 1) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
