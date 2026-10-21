-- Configuration checks. Always rolls back. Needs a project with no pending plan change.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; pid uuid; topic1 text; i int; plans jsonb; price int;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471200017' || i, now(), now());
  end loop;
  -- 1 admin, 2 second admin, 3 moderator, 4 member
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'B. Admin', 'admin'), (ids[3], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Config Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[4], 'monthly', now() + interval '30 days', 'mpesa', 'T-1');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.app_config();
  if jsonb_array_length(r->'topics') < 3 or jsonb_array_length(r->'plans') <> 3 or (r->'flags'->>'forum')::boolean is not true then bad := array_append(bad, ('app_config: ' || left(r::text, 200))); end if;
  topic1 := r->'topics'->>0;
  r := public.create_post(topic1, 'A first post here', 'This is a post that is long enough to count.', null);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('post before config changes: ' || r::text)); end if;
  r := public.admin_state();
  if r->>'code' is distinct from 'not-staff' then bad := array_append(bad, 'member read admin state'); end if;

  -- Only an Admin changes anything.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_flag('forum', false);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator set a flag'); end if;
  r := public.admin_config();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator read config'); end if;

  -- Flags are enforced.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_flag('nonsense', true);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'unknown flag'); end if;
  r := public.admin_set_flag('forum', false);
  r := public.admin_set_flag('moodCheckin', false);
  r := public.admin_set_flag('therapistVideo', false);
  r := public.admin_set_flag('disappearing', false);
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post(topic1, 'Another post here', 'This is a post that is long enough to count.', null);
  if r->>'code' is distinct from 'off' then bad := array_append(bad, ('posting while off: ' || r::text)); end if;
  r := public.add_comment(gen_random_uuid(), 'A comment while it is off');
  if r->>'code' is distinct from 'off' then bad := array_append(bad, ('commenting while off: ' || r::text)); end if;
  r := public.set_mood(3);
  if r->>'code' is distinct from 'off' then bad := array_append(bad, ('mood while off: ' || r::text)); end if;
  r := public.start_session_checkout('t-amina', 'video', now() + interval '2 days');
  if r->>'code' is distinct from 'off' then bad := array_append(bad, ('video while off: ' || r::text)); end if;
  r := public.propose_disappearing(gen_random_uuid());
  if r->>'code' is distinct from 'off' then bad := array_append(bad, ('disappearing while off: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_flag('forum', true);
  r := public.admin_set_flag('moodCheckin', true);
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.set_mood(3);
  if r->>'code' is not distinct from 'off' then bad := array_append(bad, 'mood still off after turning on'); end if;

  -- Topics.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_add_topic('A');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short topic'); end if;
  r := public.admin_add_topic('Study 2');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'digits in topic'); end if;
  r := public.admin_add_topic('Exams and study');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('add topic: ' || r::text)); end if;
  r := public.admin_add_topic('exams and study');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'duplicate topic'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('Exams and study', 'A study post here', 'This is a post that is long enough to count.', null);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('post on the new topic: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_rename_topic('Exams and study', 'Exams');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('rename: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.posts where topic = 'Exams') then bad := array_append(bad, 'rename did not carry the post'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_retire_topic('Exams');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('retire: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('Exams', 'After retiring it', 'This is a post that is long enough to count.', null);
  if r->>'code' is distinct from 'topic' then bad := array_append(bad, ('post on retired topic: ' || r::text)); end if;
  reset role;
  update private.topics set retired = true where name in (select name from private.topics where not retired order by sort offset 3);
  select name into topic1 from private.topics where not retired order by sort limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_retire_topic(topic1);
  if r->>'code' is distinct from 'min' then bad := array_append(bad, ('retired below three: ' || r::text)); end if;

  -- Limits and matching.
  r := public.admin_set_limits(90, 5, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'grace range'); end if;
  r := public.admin_set_limits(7, 1, 14);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('limits: ' || r::text)); end if;
  reset role;
  if private.limit_int('penNameChangeDays', 30) <> 1 then bad := array_append(bad, 'limit not read'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.change_pen_name('FirstChange');
  reset role;
  update public.profiles set pen_name_changed_at = now() - interval '2 days' where account_id = ids[4];
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.change_pen_name('SecondChange');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('pen name wait of 1 day not applied: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_matching(false, 2, 10);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'topic weight range'); end if;
  r := public.admin_set_matching(false, 0.5, 5);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('matching: ' || r::text)); end if;
  reset role;
  if private.rematch_cooldown() <> interval '5 days' or private.neighbours() or private.topic_weight() <> 0.5 then bad := array_append(bad, 'matching settings not read'); end if;

  -- Plans: a second Admin approves.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  plans := public.admin_config()->'plans';
  r := public.admin_propose_plans('[]'::jsonb);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'empty plan change'); end if;
  r := public.admin_propose_plans('[{"id":"monthly","enabled":true,"priceKes":-5,"entitlements":{"disappearing":true,"therapistDiscountPct":10}}]'::jsonb);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'negative price'); end if;
  r := public.admin_propose_plans('[{"id":"monthly","enabled":false,"priceKes":1500,"entitlements":{"disappearing":true,"therapistDiscountPct":10}},{"id":"daily","enabled":false,"priceKes":100,"entitlements":{"disappearing":true,"therapistDiscountPct":10}},{"id":"yearly","enabled":false,"priceKes":12000,"entitlements":{"disappearing":true,"therapistDiscountPct":10}}]'::jsonb);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'all plans switched off'); end if;
  r := public.admin_propose_plans('[{"id":"monthly","enabled":true,"priceKes":2000,"entitlements":{"disappearing":false,"therapistDiscountPct":20}}]'::jsonb);
  if r->>'proposed' is distinct from 'true' then bad := array_append(bad, ('plans not proposed: ' || r::text)); end if;
  pid := (r->>'id')::uuid;
  r := public.admin_decide_plans(pid, true);
  if r->>'code' is distinct from 'second-person' then bad := array_append(bad, 'proposer approved plans'); end if;
  reset role;
  select price_kes into price from private.plans where id = 'monthly';
  if price = 2000 then bad := array_append(bad, 'price changed before approval'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_plans(pid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('plans approve: ' || r::text)); end if;
  reset role;
  select price_kes into price from private.plans where id = 'monthly';
  if price <> 2000 or (select therapist_discount_pct from private.plans where id = 'monthly') <> 20 or (select ent_disappearing from private.plans where id = 'monthly') then bad := array_append(bad, 'plan change not applied'); end if;
  -- Without the entitlement, disappearing chats are refused even when the feature is on.
  update private.config set value = jsonb_set(value, array['disappearing'], 'true'::jsonb) where key = 'flags';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.propose_disappearing(gen_random_uuid());
  if r->>'code' is distinct from 'off' then bad := array_append(bad, ('disappearing without the entitlement: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Approved plan change') or not exists (select 1 from private.audit where action = 'Renamed topic') then bad := array_append(bad, 'audit rows missing'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL CONFIGURATION CHECKS PASSED';
end;
$$;
