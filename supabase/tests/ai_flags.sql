-- Automated flag checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; pid uuid; cid uuid; c1 text; c2 text; n int; gid text;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471400017' || i, now(), now());
  end loop;
  insert into private.staff (account_id, name, role) values (ids[1], 'M. Mod', 'moderator'), (ids[2], 'B. Bill', 'billing');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Flag A', date '1996-06-06', null, 'AngryBird', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Flag B', date '1996-06-06', null, 'CalmRiver', 'sun', array['English'], array[]::text[], 'v1');
  reset role;

  select id into pid from private.posts limit 1;
  if pid is null then
    insert into private.posts (author_id, topic, title, body) values (ids[4], 'Anxiety', 'A quiet title', 'A quiet body long enough') returning id into pid;
  end if;

  -- Quiet text raises nothing.
  insert into private.comments (post_id, author_id, body) values (pid, ids[3], 'I hear you, that sounds really hard.');
  select count(*) into n from private.flags where account_id = ids[3];
  if n <> 0 then bad := array_append(bad, 'quiet text flagged: ' || n); end if;

  -- Harassment is flagged and opens a case.
  insert into private.comments (post_id, author_id, body) values (pid, ids[3], 'You are so stupid, nobody wants you here') returning id into cid;
  select count(*) into n from private.flags where account_id = ids[3] and category = 'Harassment' and outcome = 'open' and message_ref = cid;
  if n <> 1 then bad := array_append(bad, 'harassment not flagged'); end if;
  if (select count(*) from private.reports where reported = ids[3] and flag_id is not null and reporter is null) <> 1 then bad := array_append(bad, 'no case opened'); end if;

  -- A second one within the hour does not pile up.
  insert into private.comments (post_id, author_id, body) values (pid, ids[3], 'shut up idiot');
  select count(*) into n from private.flags where account_id = ids[3] and category = 'Harassment';
  if n <> 1 then bad := array_append(bad, 'repeat flagged again: ' || n); end if;

  -- A different category is its own flag.
  insert into private.comments (post_id, author_id, body) values (pid, ids[3], 'Send me money on mpesa me tonight');
  select count(*) into n from private.flags where account_id = ids[3] and category = 'Scam / money';
  if n <> 1 then bad := array_append(bad, 'scam not flagged'); end if;

  -- A group message is scored too, a facilitator line is not.
  select id into gid from private.group_chats order by starts_at desc limit 1;
  insert into private.group_messages (group_id, account_id, body) values (gid, ids[3], 'I will kill you');
  insert into private.group_messages (group_id, therapist_id, body) values (gid, 't-amina', 'I will kill you');
  select count(*) into n from private.flags where account_id = ids[3] and category = 'Threat' and surface = 'group';
  if n <> 1 then bad := array_append(bad, 'group threat: ' || n); end if;
  if exists (select 1 from private.flags where account_id is null and created_at > now() - interval '1 minute') then bad := array_append(bad, 'facilitator line flagged'); end if;

  -- The moderator sees AI-flag cases with the model, named as an automated check.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_state();
  select x->>'id' into c1 from jsonb_array_elements(r->'cases') x where x->>'source' = 'ai-flag' and x->>'type' = 'Harassment' limit 1;
  select x->>'id' into c2 from jsonb_array_elements(r->'cases') x where x->>'source' = 'ai-flag' and x->>'type' = 'Scam or solicitation' limit 1;
  if c1 is null or c2 is null then bad := array_append(bad, 'cases missing'); end if;
  if not exists (select 1 from jsonb_array_elements(r->'cases') x where x->>'id' = c1 and x->'ai'->>'model' = 'rules-v1' and x->>'reporter' = 'Automated check') then bad := array_append(bad, 'case lacks ai fields'); end if;

  -- Deciding the case sets the flag's outcome.
  r := public.admin_decide(c1, 'dismiss', 'Rough but not abuse here');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('dismiss: ' || r::text)); end if;
  r := public.admin_decide(c2, 'strike', 'Asked for money from another member');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('strike: ' || r::text)); end if;
  r := public.admin_flags();
  if not exists (select 1 from jsonb_array_elements(r->'flags') f where f->>'category' = 'Harassment' and f->>'outcome' = 'overturned' and f->>'reviewMinutes' is not null) then bad := array_append(bad, ('overturned: ' || left(r::text, 300))); end if;
  if not exists (select 1 from jsonb_array_elements(r->'flags') f where f->>'category' = 'Scam / money' and f->>'outcome' = 'upheld') then bad := array_append(bad, 'upheld missing'); end if;
  if exists (select 1 from jsonb_array_elements(r->'flags') f where f::text like '%stupid%' or f::text like '%mpesa%') then bad := array_append(bad, 'flag log shows message text'); end if;

  -- Billing staff can't read the flag log.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_flags();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'billing read flags'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
