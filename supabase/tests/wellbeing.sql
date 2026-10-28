-- Wellbeing checks: limits, breaks, rota, hand-on. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; rep1 uuid; rep2 uuid; wk bigint; i int;
begin
  for i in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471200012' || i, now(), now());
  end loop;
  -- 1 admin, 2 moderator A, 3 moderator B, 4 moderator C, 5 reporter-less
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'M. Alpha', 'moderator'), (ids[3], 'M. Bravo', 'moderator'), (ids[4], 'M. Charlie', 'moderator');
  insert into private.reports (reporter, reported_name, target, reason, note) values (null, 'X', 'message', 'threats', 'a') returning id into rep1;
  insert into private.reports (reporter, reported_name, target, reason, note) values (null, 'Y', 'message', 'harassment', 'b') returning id into rep2;
  wk := private.week_ms(private.week_start(now()));

  -- Limits can only be set by an Admin, within range.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_wellbeing(10, 4, 5);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator set limits'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_wellbeing(3, 2, 5);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'daily limit range'); end if;
  r := public.admin_set_wellbeing(10, 20, 5);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'break every above daily'); end if;
  r := public.admin_set_wellbeing(10, 4, 5);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('set limits: ' || r::text)); end if;

  -- The daily limit and breaks.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  for i in 1..10 loop
    r := public.admin_reveal('C-r:' || rep2, 'e' || i);
    if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('reveal ' || i || ': ' || r::text)); end if;
  end loop;
  r := public.admin_reveal('C-r:' || rep2, 'e11');
  if r->>'code' is distinct from 'limit' then bad := array_append(bad, 'new daily limit not applied'); end if;
  r := public.admin_wellbeing();
  if (r->'exposure'->>'count')::int <> 10 or (r->'exposure'->>'sinceBreak')::int <> 10 then bad := array_append(bad, ('exposure: ' || r::text)); end if;
  r := public.admin_start_break();
  r := public.admin_wellbeing();
  if (r->'exposure'->>'sinceBreak')::int <> 0 or (r->'exposure'->>'breakUntil') is null then bad := array_append(bad, ('after break: ' || r::text)); end if;
  r := public.admin_reveal('C-r:' || rep1, 'z1');
  if r->>'code' is distinct from 'break' then bad := array_append(bad, ('reveal during break: ' || r::text)); end if;
  r := public.admin_end_break();
  r := public.admin_wellbeing();
  if (r->'exposure'->>'breakUntil') is not null then bad := array_append(bad, 'break did not end'); end if;

  -- The rota decides who takes Severity 1. With no rota yet, the heavy flag decides.
  r := public.admin_claim('C-r:' || rep1);
  if r->>'code' is distinct from 'rota' then bad := array_append(bad, ('s1 without rota or flag: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_rota(wk, array['M. Alpha', 'Nobody Here']);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'unknown moderator on rota'); end if;
  r := public.admin_set_rota(wk, array[]::text[]);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'empty rota'); end if;
  r := public.admin_set_rota(wk, array['M. Bravo']);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('set rota: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_claim('C-r:' || rep1);
  if r->>'code' is distinct from 'rota' then bad := array_append(bad, 'off-rota moderator took S1'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_claim('C-r:' || rep1);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('on-rota moderator: ' || r::text)); end if;
  -- Handing a case on.
  r := public.admin_hand_on('C-r:' || rep1);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('hand on: ' || r::text)); end if;
  r := public.admin_hand_on('C-r:' || rep1);
  if r->>'code' is distinct from 'owner' then bad := array_append(bad, 'handed on a case not owned'); end if;
  r := public.admin_ask_support();
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'ask support'); end if;
  -- The rota can't repeat the same people two weeks running.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_rota(wk + 7 * 86400000, array['M. Bravo']);
  if r->>'code' is distinct from 'rotate' then bad := array_append(bad, ('repeat rota: ' || r::text)); end if;
  r := public.admin_set_rota(wk + 7 * 86400000, array['M. Alpha']);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('rotated rota: ' || r::text)); end if;
  r := public.admin_wellbeing();
  if jsonb_array_length(r->'rota') <> 2 then bad := array_append(bad, ('rota weeks: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Asked for wellbeing support') then bad := array_append(bad, 'support not logged'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL WELLBEING CHECKS PASSED';
end;
$$;
