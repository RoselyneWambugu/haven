-- Billing checks. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL BILLING CHECKS PASSED". Any other text lists what failed.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  phones text[] := array['254712000021','254712000022'];
  names text[] := array['Wanjiru Kamau','Achieng Otieno'];
  dobs date[] := array[date '1995-05-05', date '1996-06-06'];
  pens text[] := array['QuietPine','RiverStone'];
  r jsonb;
  n int;
  o1 uuid; o2 uuid; ob uuid; conv uuid;
  ends1 timestamptz; ends2 timestamptz;
  rc text;
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

  -- 1. Without a plan, matching, the community and spaces are closed.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('match without plan: ' || r::text); end if;
  r := public.create_post('Grief', 'A title', 'A long enough body for this post.');
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('post without plan: ' || r::text); end if;
  r := public.forum_feed();
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('feed without plan: ' || r::text); end if;
  r := public.join_space('grief');
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('join without plan: ' || r::text); end if;
  r := public.my_plan();
  if r->'subscription' is distinct from 'null'::jsonb or jsonb_array_length(r->'plans') <> 3 then bad := bad || ('my_plan empty: ' || r::text); end if;

  -- 2. Checkout.
  r := public.start_checkout('weekly', true);
  if r->>'code' is distinct from 'plan' then bad := bad || ('unknown plan: ' || r::text); end if;
  r := public.start_checkout('monthly', true);
  if r->>'ok' is distinct from 'true' or (r->>'amount_kes')::int <> 1500 or r->>'title' <> 'Monthly peer plan' then bad := bad || ('checkout: ' || r::text); end if;
  o1 := (r->>'order_id')::uuid;
  r := public.start_checkout('daily', true);
  o2 := (r->>'order_id')::uuid;
  reset role;
  select count(*) into n from private.orders where account_id = ids[1] and status = 'pending'; if n <> 1 then bad := bad || format('pending orders: %s', n); end if;
  select count(*) into n from private.orders where id = o2 and not auto_renew; if n <> 1 then bad := bad || 'daily plan renews'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.simulate_payment(o2, 'mpesa', 'success');
  if r->>'code' is distinct from 'unavailable' then bad := bad || ('simulated payment for a normal member: ' || r::text); end if;

  -- 3. Test payments: a failed one, then a good one.
  reset role;
  insert into private.payment_test_phones (phone) values ('+254712000021');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.simulate_payment(o2, 'mpesa', 'timeout');
  if r->>'code' is distinct from 'timeout' then bad := bad || ('timeout: ' || r::text); end if;
  r := public.my_plan();
  if r->'subscription' is distinct from 'null'::jsonb then bad := bad || 'failed payment gave a plan'; end if;
  r := public.simulate_payment(o2, 'mpesa', 'success');
  if r->>'code' is distinct from 'gone' then bad := bad || ('pay a failed order: ' || r::text); end if;
  r := public.start_checkout('monthly', true);
  o1 := (r->>'order_id')::uuid;
  r := public.simulate_payment(o1, 'mpesa', 'success');
  if r->>'ok' is distinct from 'true' or r->>'receipt_no' !~ '^EC-[0-9]{6}$' then bad := bad || ('good payment: ' || r::text); end if;
  rc := r->>'receipt_no';
  r := public.simulate_payment(o1, 'mpesa', 'success');
  if r->>'code' is distinct from 'gone' then bad := bad || ('pay twice: ' || r::text); end if;
  r := public.my_plan();
  if r->'subscription'->>'plan_id' <> 'monthly' or r->'subscription'->>'receipt_no' <> rc then bad := bad || ('plan after payment: ' || r::text); end if;
  ends1 := (r->'subscription'->>'ends_at')::timestamptz;
  if ends1 < now() + interval '29 days 23 hours' or ends1 > now() + interval '30 days 1 hour' then bad := bad || ('monthly length: ' || ends1::text); end if;
  r := public.start_matching();
  if r->>'state' is distinct from 'searching' then bad := bad || ('match with plan: ' || r::text); end if;

  -- 4. Buying again adds to the plan.
  r := public.start_checkout('yearly', true);
  r := public.simulate_payment((r->>'order_id')::uuid, 'card', 'success');
  r := public.my_plan();
  ends2 := (r->'subscription'->>'ends_at')::timestamptz;
  if ends2 < ends1 + interval '364 days 23 hours' or ends2 > ends1 + interval '365 days 1 hour' then bad := bad || ('yearly adds to monthly: ' || ends1::text || ' -> ' || ends2::text); end if;

  -- 5. The payment provider confirms an order, never the app; confirming twice changes nothing.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_checkout('monthly', true);
  ob := (r->>'order_id')::uuid;
  begin
    perform public.confirm_payment(ob, 'mp-1', 'mpesa');
    bad := bad || 'a member confirmed their own payment';
  exception when insufficient_privilege then null; end;
  reset role;
  r := public.confirm_payment(ob, 'mp-1', 'mpesa');
  if r->>'ok' is distinct from 'true' then bad := bad || ('confirm: ' || r::text); end if;
  rc := r->>'receipt_no';
  r := public.confirm_payment(ob, 'mp-1', 'mpesa');
  if r->>'receipt_no' is distinct from rc then bad := bad || ('confirm twice: ' || r::text); end if;
  select count(*) into n from private.subscriptions where account_id = ids[2] and ends_at < now() + interval '30 days 1 hour'; if n <> 1 then bad := bad || 'confirm twice extended the plan'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'found' then bad := bad || ('B matches A: ' || r::text); end if;
  conv := (r->>'conversation_id')::uuid;

  -- 6. Cancelling and renewing.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.cancel_plan();
  r := public.my_plan();
  if (r->'subscription'->>'auto_renew')::boolean is not false or r->'subscription'->>'cancelled_at' is null then bad := bad || ('cancel plan: ' || r::text); end if;
  perform public.set_auto_renew(true);
  r := public.my_plan();
  if (r->'subscription'->>'auto_renew')::boolean is not true or r->'subscription'->>'cancelled_at' is not null then bad := bad || ('renew again: ' || r::text); end if;

  -- 7. When the plan ends, chats become read-only and the rest closes.
  reset role;
  update private.subscriptions set ends_at = now() - interval '1 minute' where account_id = ids[1];
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.send_message(conv, 'hello');
  if r->>'code' is distinct from 'read-only' then bad := bad || ('send after plan ended: ' || r::text); end if;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 1 then bad := bad || 'chats not readable after plan ended'; end if;
  r := public.forum_feed();
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('feed after plan ended: ' || r::text); end if;
  r := public.start_matching();
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('match after plan ended: ' || r::text); end if;

  -- 8. Nothing is readable directly, and signed-out visitors can do nothing.
  begin
    perform 1 from private.orders;
    bad := bad || 'member read orders directly';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.my_plan(); bad := bad || 'anon read plan'; exception when insufficient_privilege then null; end;
  begin perform public.start_checkout('monthly', true); bad := bad || 'anon checked out'; exception when insufficient_privilege then null; end;

  reset role;
  if cardinality(bad) > 0 then raise exception 'BILLING FAILURES: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL BILLING CHECKS PASSED';
end $$;
