-- M-Pesa payment plumbing checks. Always rolls back. (The calls to Safaricom itself can't be tested here.)
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; oid uuid; oid2 uuid;
begin
  for i in 1..2 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472200025' || i, now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Pay A', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.orders (account_id, plan_id, amount_kes, status) values (ids[1], 'monthly', 1500, 'pending') returning id into oid;
  insert into private.orders (account_id, plan_id, amount_kes, status) values (ids[1], 'daily', 100, 'pending') returning id into oid2;

  -- Members can't call the provider-side functions.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  begin
    perform public.payment_fail(oid, 'timeout');
    bad := array_append(bad, 'member called payment_fail');
  exception when insufficient_privilege then null; end;
  begin
    perform public.payment_context(oid, ids[1]);
    bad := array_append(bad, 'member called payment_context');
  exception when insufficient_privilege then null; end;
  reset role;

  -- The service role reads the order, attaches the request, and finds it again.
  set local role service_role;
  r := public.payment_context(oid, ids[1]);
  if r->>'status' <> 'pending' or (r->>'amount')::int <> 1500 or r->>'phone' is distinct from '+254722000251' then bad := array_append(bad, ('context: ' || r::text)); end if;
  r := public.payment_context(oid, ids[2]);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'context for someone else'); end if;
  r := public.payment_attach_request(oid, 'ws_CO_123');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('attach: ' || r::text)); end if;
  r := public.payment_by_request('ws_CO_123');
  if r->>'order_id' is distinct from oid::text or (r->>'amount')::int <> 1500 then bad := array_append(bad, ('by_request: ' || r::text)); end if;
  r := public.payment_by_request('ws_CO_nope');
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'unknown request found'); end if;
  r := public.payment_event('unknown_callback', 'ws_CO_nope', null, '{"x":1}'::jsonb);
  reset role;
  if not exists (select 1 from private.payment_events where kind = 'unknown_callback') then bad := array_append(bad, 'event not kept'); end if;

  -- The member sees it pending, then paid once the provider confirms it.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.order_status(oid);
  if r->>'status' <> 'pending' then bad := array_append(bad, 'not pending'); end if;
  r := public.order_status(oid2);
  if r->>'status' <> 'pending' then bad := array_append(bad, 'second not pending'); end if;
  reset role; set local role service_role;
  r := public.confirm_payment(oid, 'QHR1234ABC', 'mpesa');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('confirm: ' || r::text)); end if;
  r := public.payment_fail(oid2, 'insufficient');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.order_status(oid);
  if r->>'status' <> 'paid' or r->>'receipt_no' is null then bad := array_append(bad, ('paid: ' || r::text)); end if;
  r := public.order_status(oid2);
  if r->>'status' <> 'failed' or r->>'failure' <> 'insufficient' then bad := array_append(bad, ('failed: ' || r::text)); end if;
  -- Someone else can't read it.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  begin
    r := public.order_status(oid);
    if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'read someone else order'); end if;
  exception when others then null; end;
  reset role;
  if (select provider_ref from private.orders where id = oid) <> 'QHR1234ABC' then bad := array_append(bad, 'receipt not kept'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
