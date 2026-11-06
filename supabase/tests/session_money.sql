-- Session money checks: cancelling, a missed session and a therapist who does not come. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL PASSED (rolled back)". Any other text lists what failed.
do $$
declare
  uid uuid := gen_random_uuid();
  r jsonb;
  bad text[] := '{}';
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
  x private.sessions;
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000051', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED %', r::text; end if;
  reset role;

  -- Five paid bookings of KES 2000: more than an hour away, within the hour, a member who does not come, a therapist who is late, a therapist who has joined.
  insert into private.orders (account_id, kind, therapist_id, mode, amount_kes, status, paid_at, method) values (uid, 'session', 't-amina', 'chat', 2000, 'paid', now(), 'mpesa') returning id into o1;
  insert into private.orders (account_id, kind, therapist_id, mode, amount_kes, status, paid_at, method) values (uid, 'session', 't-amina', 'chat', 2000, 'paid', now(), 'mpesa') returning id into o2;
  insert into private.orders (account_id, kind, therapist_id, mode, amount_kes, status, paid_at, method) values (uid, 'session', 't-amina', 'chat', 2000, 'paid', now(), 'mpesa') returning id into o3;
  insert into private.orders (account_id, kind, therapist_id, mode, amount_kes, status, paid_at, method) values (uid, 'session', 't-amina', 'chat', 2000, 'paid', now(), 'mpesa') returning id into o4;
  insert into private.orders (account_id, kind, therapist_id, mode, amount_kes, status, paid_at, method) values (uid, 'session', 't-amina', 'chat', 2000, 'paid', now(), 'mpesa') returning id into o5;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, receipt_no, order_id) values (uid, 't-amina', 'chat', now() + interval '3 hours', now() + interval '3 hours 45 minutes', 2000, 'T-1', o1) returning id into s1;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, receipt_no, order_id) values (uid, 't-amina', 'chat', now() + interval '30 minutes', now() + interval '75 minutes', 2000, 'T-2', o2) returning id into s2;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, receipt_no, order_id) values (uid, 't-amina', 'chat', now() - interval '50 minutes', now() - interval '5 minutes', 2000, 'T-3', o3) returning id into s3;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, receipt_no, order_id) values (uid, 't-amina', 'chat', now() - interval '20 minutes', now() + interval '25 minutes', 2000, 'T-4', o4) returning id into s4;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, receipt_no, order_id, started_at) values (uid, 't-amina', 'chat', now() - interval '20 minutes', now() + interval '25 minutes', 2000, 'T-5', o5, now() - interval '18 minutes') returning id into s5;

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;

  -- 1. More than an hour before: everything goes back.
  r := public.cancel_session(s1);
  if r->>'ok' is distinct from 'true' or r->>'outcome' <> 'free' or (r->>'refundKes')::int <> 2000 then bad := bad || ('free cancel: ' || r::text); end if;
  reset role;
  select * into x from private.sessions where id = s1;
  if x.status <> 'cancelled' or x.refund_kes <> 2000 or x.gross_kes is not null then bad := bad || 'free cancel row'; end if;
  if not exists (select 1 from private.refunds where order_id = o1 and amount_kes = 2000 and status = 'approved' and automatic) then bad := bad || 'free cancel refund record'; end if;

  -- 2. In the last hour: 10% kept, half of it to the therapist.
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.cancel_session(s2);
  if r->>'outcome' <> 'late' or (r->>'refundKes')::int <> 1800 then bad := bad || ('late cancel: ' || r::text); end if;
  reset role;
  select * into x from private.sessions where id = s2;
  if x.refund_kes <> 1800 or x.gross_kes <> 100 or x.fee_kes <> 0 or not x.late_charge then bad := bad || ('late cancel row: ' || x.refund_kes || '/' || coalesce(x.gross_kes, -1)); end if;

  -- 3. The member did not come: 50% back, 25% to the therapist, 25% to Echo.
  perform private.settle_session_money(s3, 'member-no-show');
  select * into x from private.sessions where id = s3;
  if x.refund_kes <> 1700 or x.gross_kes is not null then bad := bad || ('no-show split: ' || x.refund_kes || '/' || coalesce(x.gross_kes, -1)); end if;
  if not exists (select 1 from private.refunds where order_id = o3 and amount_kes = 1700) then bad := bad || 'no-show refund record'; end if;

  -- 4. The therapist has not joined 15 minutes in: everything goes back and the therapist earns nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_therapist_late(s4);
  if r->>'ok' is distinct from 'true' or (r->>'refundKes')::int <> 2000 then bad := bad || ('therapist late: ' || r::text); end if;
  r := public.report_therapist_late(s4);
  if r->>'code' is distinct from 'gone' then bad := bad || ('late twice: ' || r::text); end if;
  -- 5. A therapist who joined, or one who is not yet 15 minutes late, cannot be reported.
  r := public.report_therapist_late(s5);
  if r->>'code' is distinct from 'joined' then bad := bad || ('joined: ' || r::text); end if;
  reset role;
  select * into x from private.sessions where id = s4;
  if x.status <> 'cancelled' or x.gross_kes is not null then bad := bad || 'therapist late row'; end if;

  -- 6. The member cannot move a session in the last hour.
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.reschedule_session(s5, now() + interval '5 days');
  if r->>'code' is distinct from 'late' then bad := bad || ('reschedule in the last hour: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
