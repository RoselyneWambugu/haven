-- Polls: asking, voting once, hidden counts, no replies, no editing. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; pid text;
begin
  for i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471800014' || i, now(), now());
  end loop;
  -- 1 asks, 2 votes, 3 has no plan
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Peter Ochieng', date '1996-06-06', null, 'CedarFern', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Grace Njeri', date '1996-06-06', null, 'MapleSky', 'leaf', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[1], 'monthly', now() + interval '30 days', 'mpesa', 'Q-1'), (ids[2], 'monthly', now() + interval '30 days', 'mpesa', 'Q-2');
  update public.accounts set has_posted_before = true where account_id in (ids[1], ids[2]);

  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_poll('Short', array['Yes', 'No']);
  if r->>'code' is distinct from 'question' then bad := array_append(bad, 'short question accepted'); end if;
  r := public.create_poll('Which is the best way to unwind?', array['Walk']);
  if r->>'code' is distinct from 'options' then bad := array_append(bad, 'one answer accepted'); end if;
  r := public.create_poll('Which is the best way to unwind?', array['Walk', 'walk']);
  if r->>'code' is distinct from 'options' then bad := array_append(bad, 'duplicate answers accepted'); end if;
  r := public.create_poll('Which is the best way to unwind?', array['Walk', 'Sleep', 'Music', 'Talk', 'Read']);
  if r->>'code' is distinct from 'options' then bad := array_append(bad, 'five answers accepted'); end if;
  r := public.create_poll('Do you think Wanjiku should quit her job?', array['Yes', 'No']);
  if r->>'code' is distinct from 'names' then bad := array_append(bad, 'name allowed: ' || r::text); end if;
  r := public.create_poll('Ring me to talk about it?', array['Call 0712 345 678', 'No']);
  if r->>'code' is distinct from 'blocked' then bad := array_append(bad, 'phone number allowed: ' || r::text); end if;
  r := public.create_poll('Which is the best way to unwind?', array['A long walk', 'Sleep', 'Music']);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'ask failed: ' || r::text); else pid := r->>'post_id'; end if;
  -- the asker sees counts at once; a poll cannot be edited
  r := public.poll_list();
  if (r->'polls'->pid->'options'->0->>'votes') is distinct from '0' then bad := array_append(bad, 'asker does not see counts: ' || r::text); end if;
  r := public.edit_post(pid::uuid, 'A different question entirely', 'Poll: something else');
  if r->>'code' is distinct from 'poll' then bad := array_append(bad, 'poll edited: ' || r::text); end if;
  reset role;

  -- another member: no counts before voting, vote once, then counts; no replies
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.poll_list();
  if (r->'polls'->pid->>'myVote') is not null or (r->'polls'->pid->'options'->0->>'votes') is not null then bad := array_append(bad, 'counts shown before voting: ' || r::text); end if;
  r := public.poll_vote(pid::uuid, 9);
  if r->>'code' is distinct from 'option' then bad := array_append(bad, 'bad option accepted'); end if;
  r := public.poll_vote(pid::uuid, 1);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'vote failed: ' || r::text); end if;
  r := public.poll_vote(pid::uuid, 0);
  if r->>'code' is distinct from 'voted' then bad := array_append(bad, 'voted twice: ' || r::text); end if;
  r := public.poll_list();
  if (r->'polls'->pid->>'myVote') <> '1' or (r->'polls'->pid->'options'->1->>'votes') <> '1' or (r->'polls'->pid->'options'->0->>'votes') <> '0' then bad := array_append(bad, 'counts after voting wrong: ' || r::text); end if;
  r := public.add_comment(pid::uuid, 'Great question');
  if r->>'code' is distinct from 'gossip' then bad := array_append(bad, 'reply to a poll allowed: ' || r::text); end if;
  reset role;

  -- no plan: no vote; a closed poll takes no more votes
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.poll_vote(pid::uuid, 0);
  if r->>'code' is distinct from 'needs-plan' then bad := array_append(bad, 'vote without plan'); end if;
  reset role;
  update private.posts set poll_closes_at = now() - interval '1 minute' where id = pid::uuid;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[3], 'monthly', now() + interval '30 days', 'mpesa', 'Q-3');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.poll_vote(pid::uuid, 0);
  if r->>'code' is distinct from 'closed' then bad := array_append(bad, 'vote after close: ' || r::text); end if;
  r := public.poll_list();
  if (r->'polls'->pid->'options'->1->>'votes') is distinct from '1' then bad := array_append(bad, 'closed poll hides counts: ' || r::text); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
