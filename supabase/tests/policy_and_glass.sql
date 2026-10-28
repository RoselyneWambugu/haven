-- Checks for the strike policy and break-glass access, both with two-person approval. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; pid uuid; bid uuid; rep uuid; n int; exp_days int;
begin
  for i in 1..6 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471200011' || i, now(), now());
  end loop;
  -- 1 admin, 2 admin, 3 moderator, 4 clinical, 5 clinical (second), 6 member
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin One', 'admin'), (ids[2], 'A. Admin Two', 'admin'), (ids[3], 'M. Mod', 'moderator'), (ids[4], 'C. Clin Four', 'clinical'), (ids[5], 'C. Clin Five', 'clinical');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[6], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Target Member', date '1994-04-04', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.reports (reporter, reported, reported_name, target, reason, note) values (ids[3], ids[6], 'QuietPine', 'message', 'threats', 'x') returning id into rep;

  -- Strike policy: read, validate, propose, second-person approval.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_policy();
  if (r->'policy'->>'expiryDays')::int <> 90 then bad := array_append(bad, ('default policy: ' || r::text)); end if;
  r := public.admin_propose_policy(60, 12);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator proposed policy'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_propose_policy(10, 12);
  if r->>'code' is distinct from 'range' then bad := array_append(bad, 'out-of-range policy'); end if;
  r := public.admin_propose_policy(90, 24);
  if r->>'code' is distinct from 'same' then bad := array_append(bad, 'unchanged policy accepted'); end if;
  r := public.admin_propose_policy(60, 12);
  if r->>'proposed' is distinct from 'true' then bad := array_append(bad, ('policy not proposed: ' || r::text)); end if;
  pid := (r->>'id')::uuid;
  r := public.admin_propose_policy(45, 6);
  if r->>'code' is distinct from 'pending' then bad := array_append(bad, 'two policy changes at once'); end if;
  r := public.admin_decide_policy(pid, true);
  if r->>'code' is distinct from 'second-person' then bad := array_append(bad, 'proposer approved policy'); end if;
  r := public.admin_policy();
  if (r->'policy'->>'expiryDays')::int <> 90 then bad := array_append(bad, 'policy changed before approval'); end if;
  if (r->'pending'->>'mine')::boolean is distinct from true then bad := array_append(bad, 'pending policy not mine'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_policy(pid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('policy approve: ' || r::text)); end if;
  r := public.admin_policy();
  if (r->'policy'->>'expiryDays')::int <> 60 or (r->'policy'->>'restrictionHours')::int <> 12 then bad := array_append(bad, 'policy not applied'); end if;
  -- A sanction follows the policy: a warning counts for 60 days.
  reset role;
  perform private.sanction(ids[6], 'warning', 'Threat', null, 'M. Mod');
  select (extract(epoch from (expires_at - now())) / 86400)::int into exp_days from private.notices where account_id = ids[6] and kind = 'warning';
  if exp_days not between 59 and 60 then bad := array_append(bad, ('warning expiry ' || exp_days)); end if;
  perform private.sanction(ids[6], 'restriction', 'Threat', null, 'M. Mod');
  select (extract(epoch from (expires_at - now())) / 3600)::int into exp_days from private.notices where account_id = ids[6] and kind = 'restriction';
  if exp_days not between 11 and 12 then bad := array_append(bad, ('restriction hours ' || exp_days)); end if;
  if private.strike_count(ids[6]) <> 2 then bad := array_append(bad, 'strike count'); end if;
  update private.notices set created_at = now() - interval '61 days' where account_id = ids[6] and kind = 'warning';
  if private.strike_count(ids[6]) <> 1 then bad := array_append(bad, 'old strike still counts'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_propose_policy(120, 48);
  pid := (r->>'id')::uuid;
  r := public.admin_withdraw_policy(pid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'withdraw policy'); end if;

  -- Break-glass.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_request_break_glass('C-r:' || rep, 'imminent-risk', 'A credible threat to harm someone tonight');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'clinical requested break-glass'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_request_break_glass('C-r:' || rep, 'imminent-risk', 'too short');
  if r->>'code' is distinct from 'justification' then bad := array_append(bad, 'short justification'); end if;
  r := public.admin_request_break_glass('C-r:' || rep, 'whim', 'A credible threat to harm someone tonight');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'bad reason'); end if;
  r := public.admin_request_break_glass('C-r:' || rep, 'imminent-risk', 'A credible threat to harm someone tonight');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('request: ' || r::text)); end if;
  bid := (r->>'id')::uuid;
  r := public.admin_request_break_glass('C-r:' || rep, 'imminent-risk', 'A credible threat to harm someone tonight');
  if r->>'code' is distinct from 'open' then bad := array_append(bad, 'two open requests'); end if;
  r := public.admin_private_profile(bid);
  if r->>'code' is distinct from 'expired' then bad := array_append(bad, ('profile before approval: ' || r::text)); end if;
  r := public.admin_decide_break_glass(bid, true);
  if r->>'code' is distinct from 'second-person' then bad := array_append(bad, 'moderator approved break-glass'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_break_glass(bid, true);
  if r->>'code' is distinct from 'second-person' then bad := array_append(bad, 'admin approved break-glass'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_break_glass();
  if jsonb_array_length(r->'requests') <> 1 then bad := array_append(bad, 'clinical does not see the request'); end if;
  r := public.admin_decide_break_glass(bid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;
  r := public.admin_decide_break_glass(bid, true);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'approved twice'); end if;
  -- Only the requester opens the details.
  r := public.admin_private_profile(bid);
  if r->>'code' is distinct from 'not-yours' then bad := array_append(bad, ('approver opened profile: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_private_profile(bid);
  if r->>'ok' is distinct from 'true' or r->>'name' <> 'Target Member' or r->>'phone' <> '+254712000116' then bad := array_append(bad, ('profile: ' || r::text)); end if;
  r := public.admin_break_glass();
  if jsonb_array_length(r->'requests') <> 1 then bad := array_append(bad, 'requester does not see own request'); end if;
  -- It ends after 30 minutes.
  reset role; update private.break_glass set expires_at = now() - interval '1 minute' where id = bid;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_private_profile(bid);
  if r->>'code' is distinct from 'expired' then bad := array_append(bad, 'profile after expiry'); end if;
  reset role;
  select count(*) into n from private.audit where action in ('Break-glass requested', 'Break-glass approved', 'Viewed private profile', 'Proposed strike policy change', 'Approved strike policy change');
  if n < 5 then bad := array_append(bad, ('audit rows ' || n)); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL POLICY AND BREAK-GLASS CHECKS PASSED';
end;
$$;
