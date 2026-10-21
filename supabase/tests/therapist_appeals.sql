-- Therapist appeal checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; apid text;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471500018' || i, now(), now());
  end loop;
  -- 1 and 2 clinical, 3 the therapist, 4 moderator
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Clin', 'clinical'), (ids[2], 'B. Clin', 'clinical'), (ids[4], 'M. Mod', 'moderator');
  update private.therapists set account_id = ids[3], suspended = false, paused = false where id = 't-amina';

  -- Nothing to appeal yet.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_appeal('I would like to explain what happened in detail.');
  if r->>'code' is distinct from 'none' then bad := array_append(bad, 'appealed nothing'); end if;

  -- A suspension is recorded and shown.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_suspend_therapist('t-amina', 'Boundary breach in a session');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('suspend: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_appeal_state();
  if r->'decision'->>'kind' is distinct from 'suspended' or r->'decision'->>'by' is distinct from 'A. Clin' or r->'appeal' <> 'null'::jsonb then bad := array_append(bad, ('state: ' || r::text)); end if;

  -- Appeal rules.
  r := public.portal_appeal('too short');
  if r->>'code' is distinct from 'statement' then bad := array_append(bad, 'short statement'); end if;
  r := public.portal_appeal('I was quoting the client, not advising them. Please read the whole session note.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('appeal: ' || r::text)); end if;
  r := public.portal_appeal('I was quoting the client, not advising them. Please read the whole session note.');
  if r->>'code' is distinct from 'open' then bad := array_append(bad, 'two open appeals'); end if;
  r := public.portal_appeal_state();
  apid := r->'appeal'->>'id';
  if r->'appeal'->>'status' is distinct from 'open' then bad := array_append(bad, 'appeal not open'); end if;

  -- Who can read and decide.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_therapist_appeals();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator read therapist appeals'); end if;
  r := public.admin_decide_therapist_appeal(apid, 'overturned', 'I think this was wrong.');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator decided'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_therapist_appeals();
  if jsonb_array_length(r->'appeals') <> 1 or r->'appeals'->0->>'therapistId' <> 't-amina' then bad := array_append(bad, ('list: ' || r::text)); end if;
  r := public.admin_decide_therapist_appeal(apid, 'reduced', 'I made the first decision myself.');
  if r->>'code' is distinct from 'same-reviewer' then bad := array_append(bad, 'decided own decision'); end if;

  -- A different reviewer reduces it: suspension becomes a pause.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_therapist_appeal(apid, 'reduced', 'short');
  if r->>'code' is distinct from 'explanation' then bad := array_append(bad, 'short explanation'); end if;
  r := public.admin_decide_therapist_appeal(apid, 'reduced', 'The note supports your account; a pause is enough for now.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('reduce: ' || r::text)); end if;
  r := public.admin_decide_therapist_appeal(apid, 'upheld', 'Trying to decide it twice.');
  if r->>'code' is distinct from 'decided' then bad := array_append(bad, 'decided twice'); end if;
  reset role;
  if (select suspended from private.therapists where id = 't-amina') or not (select paused from private.therapists where id = 't-amina') then bad := array_append(bad, 'reduce did not step down'); end if;

  -- The therapist sees the outcome and the new, lower decision, and can appeal again.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_appeal_state();
  if r->'decision'->>'kind' is distinct from 'paused' or r->'appeal'->>'status' is distinct from 'reduced' or r->'appeal'->>'response' is null then bad := array_append(bad, ('after reduce: ' || r::text)); end if;
  r := public.portal_appeal('A pause still stops my new clients; I would like it lifted entirely.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('second appeal: ' || r::text)); end if;
  r := public.portal_appeal_state(); apid := r->'appeal'->>'id';

  -- Overturning removes it. B made the pause, so A decides.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_therapist_appeal(apid, 'overturned', 'On reflection there was no breach.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('overturn: ' || r::text)); end if;
  reset role;
  if (select suspended or paused from private.therapists where id = 't-amina') then bad := array_append(bad, 'overturn left a restriction'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_appeal_state();
  if r->'decision' <> 'null'::jsonb then bad := array_append(bad, 'decision still shown'); end if;

  -- Lifting a pause clears its record.
  reset role; perform private.record_decision('t-amina', 'paused', 'A. Clin'); update private.therapists set paused = true where id = 't-amina';
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_lift_pause('t-amina', 'Concern resolved');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_appeal_state();
  if r->'decision' <> 'null'::jsonb then bad := array_append(bad, 'lifted pause still shown'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
