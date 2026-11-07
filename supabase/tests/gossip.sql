-- Gossip: no joining needed, names are refused, replies are refused, reactions work, and it stays out of space lists. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; pid text;
begin
  for i in 1..2 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471400009' || i, now(), now());
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Peter Ochieng', date '1996-06-06', null, 'CedarFern', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[1], 'monthly', now() + interval '30 days', 'mpesa', 'G-1'), (ids[2], 'monthly', now() + interval '30 days', 'mpesa', 'G-2');
  update public.accounts set has_posted_before = true where account_id in (ids[1], ids[2]);

  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  -- a name in the middle of a sentence is refused, and the answer names it
  r := public.create_post('Gossip', 'Big news', 'They say Wanjiku is moving out of the estate next month.', 'gossip');
  if r->>'code' is distinct from 'names' or r->>'error' not like '%Wanjiku%' then bad := array_append(bad, 'name allowed: ' || r::text); end if;
  -- the first word of a sentence, days, places and brands are fine
  r := public.create_post('Gossip', 'Fares are up', 'Everyone at the stage says the fares went up on Monday in Nairobi. Nobody has proof.', 'gossip');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'plain gossip refused: ' || r::text); else pid := r->>'post_id'; end if;
  -- contact details are still refused
  r := public.create_post('Gossip', 'Ring me', 'Everyone says to ring 0712 345 678 for the details.', 'gossip');
  if r->>'code' is distinct from 'blocked' then bad := array_append(bad, 'phone number allowed'); end if;
  reset role;

  -- it is in the feed for another member, who can react but not reply
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.forum_feed();
  if not exists (select 1 from jsonb_array_elements(r->'posts') x where x->>'id' = pid and x->>'space' = 'gossip' and x->>'topic' = 'Gossip') then bad := array_append(bad, 'gossip not in the feed'); end if;
  r := public.add_comment(pid::uuid, 'No way, that is wild');
  if r->>'code' is distinct from 'gossip' then bad := array_append(bad, 'reply allowed: ' || r::text); end if;
  r := public.toggle_support(pid::uuid);
  if r->>'ok' is distinct from 'true' or (r->>'supports')::int <> 1 then bad := array_append(bad, 'reaction failed: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
