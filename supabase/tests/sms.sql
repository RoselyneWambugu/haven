-- SMS reminder checks. Always rolls back. (Sending itself, to Africa's Talking, can't be tested here.)
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; sid uuid; n int; msgs jsonb; mid bigint;
begin
  for i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472300026' || i, now(), now());
  end loop;
  -- 1 therapist (t-amina), 2 member who opts in, 3 member who does not
  update private.therapists set account_id = ids[1] where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Sms A', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  r := public.update_settings('{"smsReminders": true}'::jsonb);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('setting rejected: ' || r::text)); end if;
  r := public.update_settings('{"smsReminders": "yes"}'::jsonb);
  if r->>'ok' is not distinct from 'true' then bad := array_append(bad, 'non-boolean accepted'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Sms B', date '1996-06-06', null, 'CedarLeaf', 'sun', array['English'], array[]::text[], 'v1');
  reset role;
  if (select settings->>'smsReminders' from public.accounts where account_id = ids[2]) is distinct from 'true' then bad := array_append(bad, 'setting not saved'); end if;

  -- Two sessions an hour away: one member opted in, one did not.
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[2], 't-amina', 'chat', now() + interval '58 minutes', now() + interval '103 minutes', 1000) returning id into sid;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[3], 't-amina', 'chat', now() + interval '59 minutes', now() + interval '104 minutes', 1000);
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[2], 't-amina', 'chat', now() + interval '3 hours', now() + interval '4 hours', 1000);
  perform private.tick_sms(); perform private.tick_sms();
  select count(*) into n from private.sms_outbox where account_id = ids[2] and kind = 'session';
  if n <> 1 then bad := array_append(bad, 'opted-in member texts: ' || n); end if;
  select count(*) into n from private.sms_outbox where account_id = ids[3];
  if n <> 0 then bad := array_append(bad, 'member who did not opt in was texted'); end if;
  select count(*) into n from private.sms_outbox where account_id = ids[1] and kind = 'session';
  if n <> 2 then bad := array_append(bad, 'therapist texts: ' || n); end if;
  if exists (select 1 from private.sms_outbox where body ~* '(QuietPine|CedarLeaf|Amina)') then bad := array_append(bad, 'a message names someone'); end if;

  -- A licence reminder to the therapist, once.
  update private.therapists set licence_valid_to = current_date + 20 where id = 't-amina';
  perform private.tick_licences(); perform private.tick_sms(); perform private.tick_sms();
  select count(*) into n from private.sms_outbox where account_id = ids[1] and kind = 'licence';
  if n <> 1 then bad := array_append(bad, 'licence texts: ' || n); end if;

  -- Drain does nothing without the vault secret, and doesn't fail.
  perform private.drain_sms();

  -- The sender takes a batch, and a failed message is tried again, three times at most.
  set local role service_role;
  msgs := (public.sms_claim(50))->'messages';
  if jsonb_array_length(msgs) <> 4 then bad := array_append(bad, ('claimed ' || jsonb_array_length(msgs))); end if;
  if jsonb_array_length((public.sms_claim(50))->'messages') <> 0 then bad := array_append(bad, 'claimed twice'); end if;
  mid := (msgs->0->>'id')::bigint;
  perform public.sms_result(mid, false, 'network');
  reset role;
  if (select status from private.sms_outbox where id = mid) <> 'queued' then bad := array_append(bad, 'failed message not requeued'); end if;
  set local role service_role;
  perform public.sms_claim(50); perform public.sms_result(mid, false, 'network');
  perform public.sms_claim(50); perform public.sms_result(mid, false, 'network');
  reset role;
  if (select status from private.sms_outbox where id = mid) <> 'failed' then bad := array_append(bad, 'not given up after three tries'); end if;
  set local role service_role;
  perform public.sms_result((msgs->1->>'id')::bigint, true, null);
  reset role;
  if (select status from private.sms_outbox where id = (msgs->1->>'id')::bigint) <> 'sent' then bad := array_append(bad, 'sent not recorded'); end if;

  -- Members can't touch the queue.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  begin
    perform public.sms_claim(5);
    bad := array_append(bad, 'member claimed sms');
  exception when insufficient_privilege then null; end;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
