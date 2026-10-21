-- Member payments list checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; oid uuid; oid2 uuid;
begin
  for i in 1..2 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471700020' || i, now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Pay Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.orders (account_id, plan_id, amount_kes, status, method, receipt_no, paid_at) values (ids[1], 'monthly', 1500, 'paid', 'mpesa', 'T-1', now()) returning id into oid;
  insert into private.orders (account_id, plan_id, amount_kes, status, method, receipt_no, paid_at) values (ids[1], 'daily', 100, 'paid', 'mpesa', 'T-0', now() - interval '30 days') returning id into oid2;
  insert into private.orders (account_id, plan_id, amount_kes, status) values (ids[1], 'daily', 100, 'pending');
  insert into private.orders (account_id, plan_id, amount_kes, status, method, receipt_no, paid_at) values (ids[2], 'daily', 100, 'paid', 'mpesa', 'T-9', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_payments();
  if jsonb_array_length(r->'payments') <> 2 then bad := array_append(bad, ('count: ' || r::text)); end if;
  if not (r->'payments'->0->>'refundable')::boolean or (r->'payments'->1->>'refundable')::boolean then bad := array_append(bad, ('refundable flags: ' || r::text)); end if;
  r := public.request_refund(oid, 'I was charged by mistake');
  r := public.my_payments();
  if (r->'payments'->0->>'refundable')::boolean or r->'payments'->0->'refund'->>'status' is distinct from 'pending' then bad := array_append(bad, ('after request: ' || r::text)); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
