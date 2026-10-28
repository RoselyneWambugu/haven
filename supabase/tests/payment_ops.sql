-- Payment events and text queue views. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; oid uuid; eid bigint; sid bigint;
begin
  for i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472500028' || i, now(), now());
  end loop;
  insert into private.staff (account_id, name, role) values (ids[1], 'B. Bill', 'billing'), (ids[2], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Ev Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.orders (account_id, plan_id, amount_kes, status) values (ids[3], 'monthly', 1500, 'paid') returning id into oid;
  insert into private.payment_events (kind, reference, order_id, payload) values ('refund_needed', 'ws_CO_1', oid, '{"why":"the time was taken while paying"}') returning id into eid;
  insert into private.payment_events (kind, reference, order_id, payload) values ('amount_mismatch', 'ws_CO_2', oid, '{"paid":100,"expected":1500}');
  insert into private.sms_outbox (account_id, phone, kind, ref, body, status, attempts, error) values (ids[3], '254725000283', 'session', 'x1', 'hello', 'failed', 3, 'network') returning id into sid;
  insert into private.sms_outbox (account_id, phone, kind, ref, body, status) values (ids[3], '254725000283', 'session', 'x2', 'hello', 'queued');

  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_payment_events();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator saw payment events'); end if;
  r := public.admin_sms_queue();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator saw sms'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_payment_events();
  if jsonb_array_length(r->'events') < 2 then bad := array_append(bad, ('events: ' || r::text)); end if;
  if not exists (select 1 from jsonb_array_elements(r->'events') e where e->>'kind' = 'refund_needed' and e->>'penName' = 'QuietPine' and (e->>'amountKes')::int = 1500 and e->>'what' is not null) then bad := array_append(bad, ('refund_needed row: ' || r::text)); end if;
  if not exists (select 1 from jsonb_array_elements(r->'events') e where e->>'kind' = 'amount_mismatch' and e->>'detail' like 'Paid 100%') then bad := array_append(bad, 'mismatch detail'); end if;
  r := public.admin_resolve_payment_event(eid, 'x');
  if r->>'code' is distinct from 'note' then bad := array_append(bad, 'short note'); end if;
  r := public.admin_resolve_payment_event(eid, 'Refunded by M-Pesa, ref QHX123');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('resolve: ' || r::text)); end if;
  r := public.admin_resolve_payment_event(eid, 'Refunded again');
  if r->>'code' is distinct from 'resolved' then bad := array_append(bad, 'resolved twice'); end if;
  r := public.admin_payment_events();
  if not exists (select 1 from jsonb_array_elements(r->'events') e where (e->>'id')::bigint = eid and (e->>'resolved')::boolean and e->>'resolvedBy' = 'B. Bill') then bad := array_append(bad, 'resolution not shown'); end if;
  r := public.admin_sms_queue();
  if (r->>'queued')::int < 1 or (r->>'failed')::int < 1 or jsonb_array_length(r->'failures') < 1 or r->'failures'->0->>'phoneTail' <> '283' then bad := array_append(bad, ('sms queue: ' || r::text)); end if;
  if r::text like '%254725000283%' then bad := array_append(bad, 'full number exposed'); end if;
  r := public.admin_retry_sms(sid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('retry: ' || r::text)); end if;
  r := public.admin_retry_sms(sid);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'retry twice'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
