-- Refund checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; oid uuid; oid2 uuid; rid text; n int;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471200014' || i, now(), now());
  end loop;
  insert into private.staff (account_id, name, role) values (ids[1], 'B. Billing', 'billing'), (ids[2], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Paying Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.orders (account_id, plan_id, amount_kes, status, method, receipt_no, paid_at) values (ids[3], 'monthly', 1500, 'paid', 'mpesa', 'T-1', now()) returning id into oid;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[3], 'monthly', now() + interval '30 days', 'mpesa', 'T-1');
  insert into private.orders (account_id, plan_id, amount_kes, status, method, receipt_no, paid_at) values (ids[3], 'daily', 100, 'paid', 'mpesa', 'T-0', now() - interval '30 days') returning id into oid2;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.request_refund(oid, 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'short reason'); end if;
  r := public.request_refund(oid2, 'I did not use it at all');
  if r->>'code' is distinct from 'late' then bad := array_append(bad, ('late refund: ' || r::text)); end if;
  r := public.request_refund(gen_random_uuid(), 'I did not use it at all');
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'unknown order'); end if;
  r := public.request_refund(oid, 'I did not use it at all');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('request: ' || r::text)); end if;
  r := public.request_refund(oid, 'I did not use it at all');
  if r->>'code' is distinct from 'open' then bad := array_append(bad, 'two open requests'); end if;
  r := public.admin_billing();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'member read billing'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_billing();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator read billing'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_billing();
  if jsonb_array_length(r->'refunds') <> 1 or r->'refunds'->0->>'penName' <> 'QuietPine' or r->'refunds'->0->>'status' <> 'pending' then bad := array_append(bad, ('billing list: ' || r::text)); end if;
  rid := r->'refunds'->0->>'id';
  r := public.admin_decide_refund(rid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;
  r := public.admin_decide_refund(rid, false);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'decided twice'); end if;
  reset role;
  if (select refunded_at from private.orders where id = oid) is null then bad := array_append(bad, 'order not marked refunded'); end if;
  if (select ends_at from private.subscriptions where account_id = ids[3]) > now() then bad := array_append(bad, 'plan access not ended'); end if;
  if private.has_plan(ids[3]) then bad := array_append(bad, 'still has a plan after refund'); end if;
  select count(*) into n from private.daily where key = 'refunds' and day = private.today();
  if n < 1 then bad := array_append(bad, 'refund not counted'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.request_refund(oid, 'asking again after approval');
  if r->>'code' is distinct from 'refunded' then bad := array_append(bad, ('refund after refund: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Approved refund') then bad := array_append(bad, 'no audit row'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL REFUND CHECKS PASSED';
end;
$$;
