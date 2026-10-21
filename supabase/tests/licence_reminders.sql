-- Licence expiry checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; rid uuid; n int; td date := current_date;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471600019' || i, now(), now());
  end loop;
  -- 1 clinical, 2 moderator, 3 the therapist (t-amina), 4 a member
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Clin', 'clinical'), (ids[2], 'M. Mod', 'moderator');
  update private.therapists set account_id = ids[3] where id = 't-amina';

  -- Reminders are written once per stage.
  update private.therapists set licence_valid_to = td + 20 where id = 't-amina';
  perform private.tick_licences(); perform private.tick_licences();
  select count(*) into n from private.licence_reminders where therapist_id = 't-amina' and stage = 30;
  if n <> 1 then bad := array_append(bad, 'stage 30 reminders: ' || n); end if;
  update private.therapists set licence_valid_to = td + 5 where id = 't-amina';
  perform private.tick_licences();
  if not exists (select 1 from private.licence_reminders where therapist_id = 't-amina' and stage = 7) then bad := array_append(bad, 'no 7 day reminder'); end if;
  if private.licence_stage(td + 90) is not null then bad := array_append(bad, 'stage far away'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_licence();
  if (r->>'stage')::int <> 7 or jsonb_array_length(r->'reminders') <> 1 then bad := array_append(bad, ('portal_licence: ' || r::text)); end if;
  reset role;

  -- Expired: hidden from the directory and from booking.
  update private.therapists set licence_valid_to = td - 1 where id = 't-amina';
  perform private.tick_licences();
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.therapist_directory();
  if exists (select 1 from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina') then bad := array_append(bad, 'expired still listed'); end if;
  reset role;
  if private.slot_ok('t-amina', 'chat', now() + interval '2 days') then bad := array_append(bad, 'expired bookable'); end if;

  -- Renewal rules. (A renewal needs the renewed certificate, so one has been sent.)
  insert into private.application_documents (account_id, kind, path, name, size) values (ids[3], 'renewal', ids[3]::text || '/r.pdf', 'r.pdf', 100);
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_submit_renewal('', td + 400);
  if r->>'code' is distinct from 'licence' then bad := array_append(bad, 'empty number'); end if;
  r := public.portal_submit_renewal('CPB-1', td - 5);
  if r->>'code' is distinct from 'expiry' then bad := array_append(bad, 'past expiry'); end if;
  r := public.portal_submit_renewal('CPB-1', td + 4000);
  if r->>'code' is distinct from 'expiry' then bad := array_append(bad, 'far expiry'); end if;
  r := public.portal_submit_renewal('CPB-1', td + 400);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('renewal: ' || r::text)); end if;
  r := public.portal_submit_renewal('CPB-1', td + 400);
  if r->>'code' is distinct from 'pending' then bad := array_append(bad, 'two pending'); end if;

  -- Only clinical reviewers and Admins see and decide.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_licences();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator saw licences'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_licences();
  select (x->'renewal'->>'id')::uuid into rid from jsonb_array_elements(r->'licences') x where x->>'id' = 't-amina';
  if rid is null then bad := array_append(bad, 'renewal not listed'); end if;
  if not exists (select 1 from jsonb_array_elements(r->'licences') x where x->>'id' = 't-amina' and (x->>'stage')::int = 0) then bad := array_append(bad, 'expired stage not 0'); end if;
  r := public.admin_decide_renewal(rid, true, 'ok');
  if r->>'code' is distinct from 'note' then bad := array_append(bad, 'short note'); end if;
  r := public.admin_decide_renewal(rid, true, 'Checked with the board register');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;
  r := public.admin_decide_renewal(rid, false, 'Trying again later');
  if r->>'code' is distinct from 'decided' then bad := array_append(bad, 'decided twice'); end if;
  reset role;
  if (select licence_valid_to from private.therapists where id = 't-amina') <> td + 400 then bad := array_append(bad, 'expiry not extended'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.therapist_directory();
  if not exists (select 1 from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina') then bad := array_append(bad, 'renewed not listed'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
