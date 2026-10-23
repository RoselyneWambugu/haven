-- Payout claw-back and minimum withdrawal checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; sa uuid; sb uuid; oa uuid; rid bigint;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472600029' || i, now(), now());
  end loop;
  -- 1 Admin, 2 billing, 3 therapist (t-amina), 4 member
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'B. Bill', 'billing');
  update private.therapists set account_id = ids[3], payout_method = 'M-Pesa 0722 000 114' where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Claw Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.orders (account_id, kind, therapist_id, mode, start_at, amount_kes, status, paid_at, method, receipt_no) values (ids[4], 'session', 't-amina', 'chat', now() - interval '3 days', 1000, 'paid', now() - interval '4 days', 'mpesa', 'T-A') returning id into oa;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, order_id) values (ids[4], 't-amina', 'chat', now() - interval '3 days 1 hour', now() - interval '3 days', 1000, oa) returning id into sa;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[4], 't-amina', 'chat', now() - interval '4 days 1 hour', now() - interval '4 days', 2000) returning id into sb;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.portal_wrap_up(sa, 'attended', 'ok note', null);
  r := public.portal_request_payout();
  if (r->>'netKes')::int <> 850 then bad := array_append(bad, ('first payout: ' || r::text)); end if;
  perform public.portal_wrap_up(sb, 'attended', 'ok note', null);
  reset role;

  -- The member asks for a refund on session A, which was already paid out; billing approves.
  insert into private.refunds (order_id, account_id, reason) values (oa, ids[4], 'I did not attend') returning id into rid;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_refund('R-' || rid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('refund: ' || r::text)); end if;
  reset role;
  if (select amount_kes from private.payout_adjustments where session_id = sa) is distinct from 850 then bad := array_append(bad, 'no adjustment for paid-out session'); end if;
  if (select gross_kes from private.sessions where id = sa) is null then bad := array_append(bad, 'paid-out session lost its record'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_earnings();
  if (r->>'owedBackKes')::int <> 850 or (r->>'availableNet')::int <> 850 then bad := array_append(bad, ('earnings: ' || r::text)); end if;

  -- A minimum above what is available stops the withdrawal. The fee change keeps the minimum.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_min_payout(1000);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'billing set minimum'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_min_payout(-5);
  if r->>'code' is distinct from 'range' then bad := array_append(bad, 'negative minimum'); end if;
  r := public.admin_set_min_payout(1000);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('min: ' || r::text)); end if;
  r := public.admin_propose_fee(20);
  if r->>'applied' is distinct from 'true' then bad := array_append(bad, ('fee applied: ' || r::text)); end if;
  r := public.admin_fee();
  if (r->>'minPayoutKes')::int <> 1000 then bad := array_append(bad, 'admin_fee lacks minimum'); end if;
  reset role;
  if private.min_payout() <> 1000 or private.platform_fee_pct() <> 20 then bad := array_append(bad, 'fee change lost the minimum'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_request_payout();
  if r->>'code' is distinct from 'minimum' then bad := array_append(bad, ('minimum not enforced: ' || r::text)); end if;
  reset role; update private.config set value = value || '{"minPayoutKes":500}'::jsonb where key = 'fees';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_request_payout();
  if r->>'ok' is distinct from 'true' or (r->>'netKes')::int <> 850 then bad := array_append(bad, ('second payout: ' || r::text)); end if;
  reset role;
  if exists (select 1 from private.payout_adjustments where applied_payout_id is null) then bad := array_append(bad, 'adjustment not applied'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_payouts();
  if not exists (select 1 from jsonb_array_elements(r->'payouts') p where (p->>'adjustmentKes')::int = 850 and (p->>'netKes')::int = 850) then bad := array_append(bad, ('admin_payouts: ' || r::text)); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
