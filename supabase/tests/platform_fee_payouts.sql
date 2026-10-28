-- Platform fee and payout checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; sa uuid; sb uuid; sc uuid; sd uuid; pid text; fid uuid;
begin
  for i in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472000023' || i, now(), now());
  end loop;
  -- 1 and 2 Admins, 3 billing, 4 the therapist (t-amina), 5 a member
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'B. Admin', 'admin'), (ids[3], 'C. Bill', 'billing');
  update private.therapists set account_id = ids[4], payout_method = '' where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Fee Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[5], 't-amina', 'chat', now() - interval '3 days 1 hour', now() - interval '3 days', 1000) returning id into sa;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[5], 't-amina', 'chat', now() - interval '2 hours', now() - interval '1 hour', 2000) returning id into sb;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[5], 't-amina', 'chat', now() - interval '4 days 1 hour', now() - interval '4 days', 1500) returning id into sc;

  if private.platform_fee_pct() <> 15 then bad := array_append(bad, 'default fee ' || private.platform_fee_pct()); end if;

  -- The fee is fixed on each session when it is completed; a no-show earns nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_wrap_up(sa, 'attended', 'ok note', null);
  r := public.portal_wrap_up(sb, 'attended', 'ok note', null);
  r := public.portal_wrap_up(sc, 'no-show', '', null);
  reset role;
  if (select fee_kes from private.sessions where id = sa) <> 150 or (select fee_kes from private.sessions where id = sb) <> 300 then bad := array_append(bad, 'fees not fixed'); end if;
  if (select fee_kes from private.sessions where id = sc) is not null then bad := array_append(bad, 'no-show has a fee'); end if;

  -- Available after the 24 hour hold, pending before it.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_earnings();
  if (r->>'availableNet')::int <> 850 or (r->>'pendingNet')::int <> 1700 or (r->>'feePct')::int <> 15 then bad := array_append(bad, ('earnings: ' || r::text)); end if;
  r := public.my_portal();
  if not exists (select 1 from jsonb_array_elements(r->'sessions') x where x->>'id' = sa::text and (x->>'fee_kes')::int = 150) then bad := array_append(bad, 'my_portal lacks fee'); end if;

  -- Withdrawing needs somewhere to send the money, and only works once.
  r := public.portal_request_payout();
  if r->>'code' is distinct from 'method' then bad := array_append(bad, ('no method: ' || r::text)); end if;
  reset role; update private.therapists set payout_method = 'M-Pesa 0722 000 114' where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_request_payout();
  if r->>'ok' is distinct from 'true' or (r->>'netKes')::int <> 850 then bad := array_append(bad, ('payout: ' || r::text)); end if;
  pid := r->>'id';
  r := public.portal_request_payout();
  if r->>'code' is distinct from 'nothing' then bad := array_append(bad, 'withdrew twice'); end if;
  r := public.portal_earnings();
  if (r->>'availableNet')::int <> 0 or jsonb_array_length(r->'payouts') <> 1 or r->'payouts'->0->>'status' <> 'requested' then bad := array_append(bad, ('after payout: ' || r::text)); end if;

  -- The fee changes with a second Admin; past sessions keep theirs.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_propose_fee(60);
  if r->>'code' is distinct from 'range' then bad := array_append(bad, 'range'); end if;
  r := public.admin_propose_fee(20);
  if r->>'proposed' is distinct from 'true' then bad := array_append(bad, ('propose: ' || r::text)); end if;
  fid := (r->>'id')::uuid;
  r := public.admin_decide_fee(fid, true);
  if r->>'code' is distinct from 'second-person' then bad := array_append(bad, 'proposer approved own'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_fee(fid, true);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'billing decided fee'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_fee();
  if (r->'pending'->>'pct')::int <> 20 or (r->'pending'->>'mine')::boolean then bad := array_append(bad, ('admin_fee: ' || r::text)); end if;
  r := public.admin_decide_fee(fid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;
  reset role;
  if private.platform_fee_pct() <> 20 then bad := array_append(bad, 'fee not changed'); end if;
  if (select fee_kes from private.sessions where id = sa) <> 150 then bad := array_append(bad, 'past fee changed'); end if;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[5], 't-amina', 'chat', now() - interval '3 hours', now() - interval '2 hours', 1000) returning id into sd;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_wrap_up(sd, 'attended', 'ok note', null);
  reset role;
  if (select fee_kes from private.sessions where id = sd) <> 200 then bad := array_append(bad, 'new fee not applied'); end if;

  -- Billing marks the payout paid, with a reference.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_mark_payout_paid(pid, 'MPESA123');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'therapist marked paid'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_payouts();
  if r->'payouts'->0->>'therapist' is null or r->'payouts'->0->>'status' <> 'requested' then bad := array_append(bad, ('admin_payouts: ' || r::text)); end if;
  r := public.admin_mark_payout_paid(pid, 'x');
  if r->>'code' is distinct from 'reference' then bad := array_append(bad, 'short reference'); end if;
  r := public.admin_mark_payout_paid(pid, 'MPESA123');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('mark paid: ' || r::text)); end if;
  r := public.admin_mark_payout_paid(pid, 'MPESA123');
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'paid twice'); end if;
  reset role;
  if position('gross_kes = null, fee_kes = null' in pg_get_functiondef('public.admin_decide_refund(text,boolean)'::regprocedure)) = 0 then bad := array_append(bad, 'refund not patched'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
