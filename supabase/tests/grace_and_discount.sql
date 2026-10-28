-- Grace period and therapy discount checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; conv uuid;
begin
  for i in 1..2 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471800021' || i, now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Grace A', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Grace B', date '1996-06-06', null, 'CedarLeaf', 'sun', array['English'], array[]::text[], 'v1');
  reset role;
  insert into public.conversations (kind, expires_at) values ('peer', now() + interval '12 hours') returning id into conv;
  insert into public.conversation_members (conversation_id, account_id) values (conv, ids[1]), (conv, ids[2]);

  -- Plan ended 3 days ago, grace is 7: still readable.
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[1], 'monthly', now() - interval '3 days', 'mpesa', 'G-1');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 1 then bad := array_append(bad, 'in grace but hidden'); end if;
  reset role;

  -- Ended 10 days ago: hidden.
  update private.subscriptions set ends_at = now() - interval '10 days' where account_id = ids[1];
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 0 then bad := array_append(bad, 'past grace but visible'); end if;
  reset role;

  -- A longer grace brings it back.
  update private.config set value = jsonb_set(value, '{graceDays}', '14') where key = 'limits';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 1 then bad := array_append(bad, 'longer grace ignored'); end if;
  reset role;

  -- The other member, whose plan is active, is unaffected.
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[2], 'monthly', now() + interval '20 days', 'mpesa', 'G-2');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 1 then bad := array_append(bad, 'active plan hidden'); end if;
  reset role;

  -- Therapy discount.
  update private.plans set therapist_discount_pct = 10 where id = 'monthly';
  if private.discounted_price(ids[2], 1500) <> 1350 then bad := array_append(bad, 'discount ' || private.discounted_price(ids[2], 1500)); end if;
  if private.discounted_price(ids[1], 1500) <> 1500 then bad := array_append(bad, 'discount without active plan'); end if;
  if private.discounted_price(ids[2], null) is not null then bad := array_append(bad, 'null price'); end if;
  update private.plans set therapist_discount_pct = 0 where id = 'monthly';
  if private.discounted_price(ids[2], 1500) <> 1500 then bad := array_append(bad, 'zero discount'); end if;
  update private.plans set therapist_discount_pct = 50 where id = 'monthly';
  if private.discounted_price(ids[2], 1501) <> 751 then bad := array_append(bad, 'rounding ' || private.discounted_price(ids[2], 1501)); end if;
  if position('discounted_price(uid, t.price_kes)' in pg_get_functiondef('public.start_session_checkout(text,text,timestamptz)'::regprocedure)) = 0 then bad := array_append(bad, 'checkout not patched'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
