-- Therapists and sessions checks. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL THERAPIST CHECKS PASSED". Any other text lists what failed.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  phones text[] := array['254712000031','254712000032'];
  names text[] := array['Wanjiru Kamau','Achieng Otieno'];
  dobs date[] := array[date '1995-05-05', date '1996-06-06'];
  pens text[] := array['QuietPine','RiverStone'];
  r jsonb;
  n int;
  s1 timestamptz; s2 timestamptz; s3 timestamptz; s4 timestamptz;
  o uuid; sess1 uuid; sess2 uuid; conv uuid;
  bad text[] := '{}';
  i int;
begin
  for i in 1..2 loop
    reset role;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
      values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', phones[i], now(), now());
    reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[i], 'role', 'authenticated')::text, true); set local role authenticated;
    r := public.register_member(names[i], dobs[i], null, pens[i], 'moon', array['English'], array[]::text[], 'v1');
    if r->>'ok' is distinct from 'true' then bad := bad || ('register ' || i || ': ' || r::text); end if;
  end loop;
  if cardinality(bad) > 0 then raise exception 'SETUP FAILED: %', array_to_string(bad, ' | '); end if;
  reset role;
  insert into private.payment_test_phones (phone) values ('+254712000031'), ('+254712000032');
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) select x, 'monthly', now() + interval '30 days', 'mpesa', 'T-1' from unnest(ids) x;

  -- 1. The directory.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.therapist_directory();
  if jsonb_array_length(r->'therapists') <> 6 then bad := bad || ('directory size: ' || jsonb_array_length(r->'therapists')); end if;
  if not exists (select 1 from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina' and jsonb_array_length(x->'availability') = 5 and (x->>'price_kes')::int = 1500 and (x->>'rating_count')::int = 0) then bad := bad || 'amina record'; end if;
  if r::text like '%account_id%' then bad := bad || 'directory shows account ids'; end if;

  -- 2. Which times can be booked.
  reset role;
  select d into s1 from generate_series(date_trunc('hour', now()) + interval '3 hours', now() + interval '10 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) order by d limit 1;
  if s1 is null then raise exception 'NO SLOT FOUND for t-amina in the next 10 days'; end if;
  if private.slot_ok('t-amina', 'chat', now() - interval '1 hour') then bad := bad || 'past slot ok'; end if;
  if private.slot_ok('t-james', 'video', s1) then bad := bad || 'unoffered mode ok'; end if;
  if private.slot_ok('t-grace', 'chat', s1) then bad := bad || 'not accepting ok'; end if;
  if private.slot_ok('t-amina', 'chat', s1 + interval '20 minutes') then bad := bad || 'off-grid slot ok'; end if;
  select d into s2 from generate_series(s1 + interval '2 hours', now() + interval '12 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) order by d limit 1;
  select d into s3 from generate_series(s2 + interval '2 hours', now() + interval '13 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) order by d limit 1;
  select d into s4 from generate_series(s3 + interval '2 hours', now() + interval '14 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) order by d limit 1;
  if s2 is null or s3 is null or s4 is null then raise exception 'NOT ENOUGH SLOTS for t-amina: % % %', s2, s3, s4; end if;

  -- 3. Checkout rules.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_session_checkout('t-nobody', 'chat', s1);
  if r->>'code' is distinct from 'therapist' then bad := bad || ('unknown therapist: ' || r::text); end if;
  r := public.start_session_checkout('t-james', 'video', s1);
  if r->>'code' is distinct from 'mode' then bad := bad || ('mode: ' || r::text); end if;
  r := public.start_session_checkout('t-grace', 'chat', s1);
  if r->>'code' is distinct from 'taken' then bad := bad || ('not accepting: ' || r::text); end if;
  r := public.start_session_checkout('t-amina', 'chat', s1);
  if r->>'ok' is distinct from 'true' or (r->>'amount_kes')::int <> 1500 or r->>'title' <> 'Session with Dr. Amina Otieno' then bad := bad || ('checkout: ' || r::text); end if;
  o := (r->>'order_id')::uuid;
  r := public.simulate_payment(o, 'mpesa', 'success');
  if r->>'ok' is distinct from 'true' or r->'session_id' is null then bad := bad || ('pay session: ' || r::text); end if;
  sess1 := (r->>'session_id')::uuid;
  r := public.my_sessions();
  if jsonb_array_length(r->'sessions') <> 1 or r->'sessions'->0->>'status' <> 'booked' or r->'sessions'->0->>'therapist_id' <> 't-amina' then bad := bad || ('my_sessions: ' || r::text); end if;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 1 or r->'conversations'->0->>'kind' <> 'therapist' or r->'conversations'->0->>'therapist_id' <> 't-amina' or r->'conversations'->0->'peer' is distinct from 'null'::jsonb then bad := bad || ('therapist chat: ' || r::text); end if;
  if r->'conversations'->0->'messages'->0->>'text' not like 'Session booked for %' then bad := bad || ('welcome note: ' || r::text); end if;
  conv := (r->'conversations'->0->>'id')::uuid;
  r := public.therapist_directory();
  if not exists (select 1 from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina' and x->'taken' @> to_jsonb((extract(epoch from s1) * 1000)::bigint)) then bad := bad || 'booked time not shown as taken'; end if;

  -- 4. One therapist at a time; no double booking.
  r := public.start_session_checkout('t-james', 'chat', s1 + interval '1 day');
  if r->>'code' is distinct from 'one-therapist' then bad := bad || ('one therapist: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_session_checkout('t-amina', 'chat', s1);
  if r->>'code' is distinct from 'taken' then bad := bad || ('double booking: ' || r::text); end if;
  r := public.start_session_checkout('t-amina', 'chat', s3);
  o := (r->>'order_id')::uuid;
  reset role;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at) values (ids[1], 't-amina', 'chat', s3, s3 + interval '45 minutes');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.simulate_payment(o, 'mpesa', 'success');
  if r->>'code' is distinct from 'taken' then bad := bad || ('slot lost while paying: ' || r::text); end if;
  reset role;
  select count(*) into n from private.sessions where member_id = ids[2]; if n <> 0 then bad := bad || 'session booked after slot was lost'; end if;

  -- 5. Joining and finishing.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.join_session(sess1);
  if r->>'code' is distinct from 'early' then bad := bad || ('join early: ' || r::text); end if;
  r := public.complete_session(sess1);
  if r->>'code' is distinct from 'early' then bad := bad || ('complete early: ' || r::text); end if;
  reset role;
  update private.sessions set start_at = now() + interval '5 minutes', end_at = now() + interval '50 minutes' where id = sess1;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.join_session(sess1);
  if r->>'ok' is distinct from 'true' then bad := bad || ('join open: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.join_session(sess1);
  if r->>'code' is distinct from 'gone' then bad := bad || ('someone else joined: ' || r::text); end if;
  reset role;
  update private.sessions set start_at = now() - interval '10 minutes', end_at = now() + interval '35 minutes' where id = sess1;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.rate_session(sess1, 5, 'x');
  if r->>'code' is distinct from 'gone' then bad := bad || ('rate before finishing: ' || r::text); end if;
  r := public.complete_session(sess1);
  if r->>'ok' is distinct from 'true' then bad := bad || ('complete: ' || r::text); end if;
  r := public.rate_session(sess1, 9, '');
  if r->>'code' is distinct from 'invalid' then bad := bad || ('rate 9: ' || r::text); end if;
  r := public.rate_session(sess1, 5, 'Felt heard.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('rate: ' || r::text); end if;
  r := public.my_sessions();
  if r->'sessions'->0->>'status' <> 'completed' or r->'sessions'->0->'rating'->>'stars' <> '5' or r->'sessions'->0->>'follow_up_offer' is null then bad := bad || ('after rating: ' || r::text); end if;
  r := public.therapist_directory();
  if not exists (select 1 from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina' and (x->>'rating_count')::int = 1 and (x->>'rating_sum')::int = 5) then bad := bad || 'rating not in directory'; end if;
  if r::text like '%Felt heard%' then bad := bad || 'private comment shown in directory'; end if;

  -- 6. Changing a session: a late change, a taken time, a free cancel.
  r := public.start_session_checkout('t-amina', 'chat', s2);
  r := public.simulate_payment((r->>'order_id')::uuid, 'card', 'success');
  sess2 := (r->>'session_id')::uuid;
  reset role;
  update private.sessions set start_at = now() + interval '5 hours', end_at = now() + interval '5 hours 45 minutes' where id = sess2;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.reschedule_session(sess2, s3);
  if r->>'code' is distinct from 'taken' then bad := bad || ('reschedule onto a taken time: ' || r::text); end if;
  r := public.reschedule_session(sess2, s4);
  if r->>'ok' is distinct from 'true' or r->>'outcome' <> 'late' then bad := bad || ('late reschedule: ' || r::text); end if;
  reset role;
  update private.sessions set start_at = now() + interval '3 days', end_at = now() + interval '3 days 45 minutes' where id = sess2;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.cancel_session(sess2);
  if r->>'ok' is distinct from 'true' or r->>'outcome' <> 'free' then bad := bad || ('free cancel: ' || r::text); end if;
  r := public.cancel_session(sess2);
  if r->>'code' is distinct from 'gone' then bad := bad || ('cancel twice: ' || r::text); end if;

  -- 7. The therapist chat: lasts past the session, and a lapsed plan doesn't close it.
  reset role;
  select count(*) into n from public.conversations where id = conv and expires_at >= (select max(end_at) from private.sessions where member_id = ids[1] and status = 'completed') + interval '23 hours'; if n <> 1 then bad := bad || 'chat expiry'; end if;
  update private.subscriptions set ends_at = now() - interval '1 minute' where account_id = ids[1];
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.send_message(conv, 'Thank you for today.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('therapist chat after plan ended: ' || r::text); end if;
  r := public.send_message(conv, 'my number is 0712 345 678');
  if r->>'code' is distinct from 'blocked' then bad := bad || ('phone in therapist chat: ' || r::text); end if;
  reset role;
  update public.conversations set expires_at = now() + interval '10 hours' where id = conv;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.my_chats(); r := public.my_chats();
  if (select count(*) from jsonb_array_elements(r->'conversations'->0->'messages') x where x->>'text' like 'This chat ends in about a day%') <> 1 then bad := bad || 'a-day-left note not exactly once'; end if;

  -- 8. Blocking and reporting go through the session for a therapist.
  r := public.block_peer(conv, false);
  if r->>'code' is distinct from 'not-peer' then bad := bad || ('block a therapist chat: ' || r::text); end if;
  r := public.report_chat(conv, 'other', '');
  if r->>'code' is distinct from 'not-peer' then bad := bad || ('report a therapist chat: ' || r::text); end if;
  r := public.report_session(sess1, 'bogus', '');
  if r->>'code' is distinct from 'invalid' then bad := bad || ('report reason: ' || r::text); end if;
  r := public.report_session(sess1, 'therapist-boundaries', 'It felt wrong.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('report session: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_session(sess1, 'other', '');
  if r->>'code' is distinct from 'gone' then bad := bad || ('report someone else session: ' || r::text); end if;
  reset role;
  select count(*) into n from private.reports where target = 'session' and session_id = sess1 and queue = 'clinical' and therapist_id = 't-amina' and jsonb_array_length(snapshot) >= 3 and prior_reports = 0; if n <> 1 then bad := bad || 'session report'; end if;
  select count(*) into n from public.conversations where id = conv and reported_at is not null; if n <> 1 then bad := bad || 'reported chat not marked'; end if;

  -- 9. Privacy.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_sessions();
  if jsonb_array_length(r->'sessions') <> 0 then bad := bad || ('B sees A sessions: ' || r::text); end if;
  begin perform 1 from private.sessions; bad := bad || 'member read sessions directly'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.therapists; bad := bad || 'member read therapists directly'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.therapist_directory(); bad := bad || 'anon read the directory'; exception when insufficient_privilege then null; end;
  begin perform public.start_session_checkout('t-amina', 'chat', s1); bad := bad || 'anon booked'; exception when insufficient_privilege then null; end;

  reset role;
  if cardinality(bad) > 0 then raise exception 'THERAPIST FAILURES: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL THERAPIST CHECKS PASSED';
end $$;
