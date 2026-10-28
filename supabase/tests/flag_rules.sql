-- Flag rules and contact-filter counts. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; rid int; n0 int; n1 int; gid text;
begin
  for i in 1..3 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25472800031' || i, now(), now());
  end loop;
  -- 1 clinical, 2 moderator, 3 member with a plan
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Clin', 'clinical'), (ids[2], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Rule Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[3], 'monthly', now() + interval '30 days', 'mpesa', 'R-1');
  select id into gid from private.group_chats where template_key = 'grief' and starts_at > now() and cancelled_at is null limit 1;
  update private.group_chats set starts_at = now() - interval '5 minutes' where id = gid;
  insert into private.group_members (group_id, account_id) values (gid, ids[3]);

  -- A blocked message is counted without keeping its words.
  select count(*) into n0 from private.filter_blocks;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.group_send(gid, 'call me on 0712345678 please');
  if r->>'code' is distinct from 'blocked' then bad := array_append(bad, ('not blocked: ' || r::text)); end if;
  reset role;
  select count(*) into n1 from private.filter_blocks;
  if n1 <> n0 + 1 then bad := array_append(bad, 'block not counted'); end if;
  if not exists (select 1 from private.filter_blocks where account_id = ids[3] and 'phone' = any (reasons)) then bad := array_append(bad, 'block not attributed'); end if;

  -- Who can see and change the rules.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_flag_rules();
  if jsonb_array_length(r->'rules') < 9 or (r->>'blocked24h')::int < 1 or (r->'blockedByKind'->>'phone')::int < 1 then bad := array_append(bad, ('rules view: ' || left(r::text, 200))); end if;
  r := public.admin_save_flag_rule(null, 'Test rule', 'scam', 'free airtime', 0.7, true);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator saved a rule'); end if;
  r := public.admin_test_flag_text('Send me money on mpesa me tonight');
  if (r->>'flagged')::boolean is not true or r->>'category' <> 'Scam / money' then bad := array_append(bad, ('test text: ' || r::text)); end if;
  r := public.admin_test_flag_text('I hear you, that sounds really hard');
  if (r->>'flagged')::boolean then bad := array_append(bad, 'kind words flagged'); end if;

  -- Validation, then add, change, switch off.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_save_flag_rule(null, 'Test rule', 'scam', '(', 0.7, true);
  if r->>'code' is distinct from 'pattern' then bad := array_append(bad, 'invalid pattern accepted'); end if;
  r := public.admin_save_flag_rule(null, 'Test rule', 'scam', '.*', 0.7, true);
  if r->>'code' is distinct from 'pattern' then bad := array_append(bad, 'matches-everything accepted'); end if;
  r := public.admin_save_flag_rule(null, 'Test rule', 'scam', '\y(hello|thank)\y', 0.7, true);
  if r->>'code' is distinct from 'pattern' then bad := array_append(bad, 'kind-words pattern accepted'); end if;
  r := public.admin_save_flag_rule(null, 'Test rule', 'scam', 'free airtime', 0.1, true);
  if r->>'code' is distinct from 'confidence' then bad := array_append(bad, 'low confidence accepted'); end if;
  r := public.admin_save_flag_rule(null, 'Test rule', 'nonsense', 'free airtime', 0.7, true);
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'unknown reason accepted'); end if;
  r := public.admin_save_flag_rule(null, 'Free airtime', 'scam', '\y(free airtime|free data bundles)\y', 0.7, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('add: ' || r::text)); end if;
  rid := (r->>'id')::int;
  r := public.admin_test_flag_text('Win free airtime now');
  if (r->>'flagged')::boolean is not true or r->>'category' <> 'Free airtime' then bad := array_append(bad, ('new rule not live: ' || r::text)); end if;
  r := public.admin_save_flag_rule(rid, 'Free airtime', 'scam', '\y(free airtime|free data bundles)\y', 0.7, false);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('switch off: ' || r::text)); end if;
  r := public.admin_test_flag_text('Win free airtime now');
  if (r->>'flagged')::boolean then bad := array_append(bad, 'switched-off rule still flags'); end if;
  r := public.admin_save_flag_rule(99999, 'Missing', 'scam', 'free airtime', 0.7, true);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'edited a missing rule'); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Switched off a flag rule') then bad := array_append(bad, 'change not logged'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
