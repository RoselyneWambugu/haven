-- Linking therapists and staff by a confirmed email. Always rolls back.
do $$
declare
  admin_id uuid := gen_random_uuid(); clin uuid := gen_random_uuid(); th uuid := gen_random_uuid(); st uuid := gen_random_uuid(); late uuid := gen_random_uuid();
  r jsonb; bad text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254713000061', now(), now()),
    (clin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254713000062', now(), now());
  insert into private.staff (account_id, name, role) values (admin_id, 'A. Admin', 'admin'), (clin, 'C. Clinical', 'clinical');
  update private.therapists set account_id = null, link_phone = null where id = 't-amina';

  -- A clinical reviewer links a therapist by an email that has not signed in yet.
  perform set_config('request.jwt.claims', json_build_object('sub', clin, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_link_therapist_email('t-amina', 'not-an-email');
  if r->>'code' is distinct from 'email' then bad := array_append(bad, 'bad email accepted'); end if;
  r := public.admin_link_therapist_email('t-amina', 'Amina.Therapist@Example.com');
  if r->>'ok' is distinct from 'true' or (r->>'pending')::boolean is not true then bad := array_append(bad, 'link: ' || r::text); end if;
  -- Linking again before the first sign-in replaces the waiting email.
  r := public.admin_link_therapist_email('t-amina', 'other@example.com');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'second link: ' || r::text); end if;
  r := public.admin_link_therapist_email('t-amina', 'amina.therapist@example.com');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'relink: ' || r::text); end if;
  reset role;

  -- The first sign-in with that email, confirmed, makes the link.
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (th, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amina.therapist@example.com', now(), now(), now());
  if (select account_id from private.therapists where id = 't-amina') is distinct from th then bad := array_append(bad, 'therapist not linked on sign-in'); end if;
  if (select link_email from private.therapists where id = 't-amina') is not null then bad := array_append(bad, 'link_email not cleared'); end if;

  -- An unconfirmed email does not link.
  update private.therapists set account_id = null, link_email = 'later@example.com' where id = 't-amina';
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (late, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'later@example.com', now(), now());
  if (select account_id from private.therapists where id = 't-amina') is not null then bad := array_append(bad, 'unconfirmed email linked'); end if;
  update auth.users set email_confirmed_at = now() where id = late;
  if (select account_id from private.therapists where id = 't-amina') is distinct from late then bad := array_append(bad, 'not linked once confirmed'); end if;

  -- An Admin adds a team member by email; with one Admin it applies at once and waits for the first sign-in.
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_add_staff_email('T. Moderator', 'moderator', 'mod.person@example.com');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'add staff: ' || r::text); end if;
  r := public.admin_add_staff_email('T. Moderator', 'moderator', 'someone.else@example.com');
  if r->>'code' is distinct from 'name' then bad := array_append(bad, 'duplicate name: ' || r::text); end if;
  r := public.admin_staff_email_invites();
  if jsonb_array_length(r->'invites') <> 1 or r->'invites'->0->>'hint' is distinct from 'mo…@example.com' then bad := array_append(bad, 'invites list: ' || r::text); end if;
  reset role;
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (st, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Mod.Person@example.com', now(), now(), now());
  if not exists (select 1 from private.staff where account_id = st and role = 'moderator' and name = 'T. Moderator') then bad := array_append(bad, 'staff not made on sign-in'); end if;
  if exists (select 1 from private.staff_email_invites where not used) then bad := array_append(bad, 'invite not used'); end if;

  -- A therapist link to a staff member's email is refused.
  update private.therapists set account_id = null, link_email = null where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', clin, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_link_therapist_email('t-amina', 'mod.person@example.com');
  if r->>'code' is distinct from 'staff' then bad := array_append(bad, 'staff email linked as therapist: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
