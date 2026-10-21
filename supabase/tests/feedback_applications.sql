-- Feedback and therapist application checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; conv uuid; aid uuid; fbid text; i int; th private.therapists;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471200016' || i, now(), now());
  end loop;
  -- 1 admin, 2 billing, 3 clinical, 4 applicant/member
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'B. Bill', 'billing'), (ids[3], 'C. Clin', 'clinical');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Feedback Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into public.conversations (kind, expires_at) values ('peer', now() + interval '1 day') returning id into conv;
  insert into public.conversation_members (conversation_id, account_id) values (conv, ids[4]);

  -- Felt heard.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.rate_heard(conv, 9, '');
  if r->>'code' is distinct from 'score' then bad := array_append(bad, 'bad score'); end if;
  r := public.rate_heard(gen_random_uuid(), 4, '');
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'rated a conversation not in'); end if;
  r := public.rate_heard(conv, 4, 'Good listener');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'rate'); end if;
  r := public.rate_heard(conv, 1, 'Changed my mind');
  reset role;
  if (select score from private.heard where conversation_id = conv) <> 4 then bad := array_append(bad, 'answer changed on second rate'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;

  -- Notes.
  r := public.send_feedback('idea', '   ', false);
  if r->>'code' is distinct from 'empty' then bad := array_append(bad, 'empty note'); end if;
  r := public.send_feedback('idea', repeat('x', 1001), false);
  if r->>'code' is distinct from 'long' then bad := array_append(bad, 'long note'); end if;
  r := public.send_feedback('rant', 'hello there', false);
  if r->>'code' is distinct from 'kind' then bad := array_append(bad, 'bad kind'); end if;
  for i in 1..10 loop r := public.send_feedback('idea', 'Please add dark mode ' || i, true); end loop;
  r := public.send_feedback('idea', 'one too many', false);
  if r->>'code' is distinct from 'limit' then bad := array_append(bad, 'note limit'); end if;

  -- Staff: billing and Admin only; shares hidden while under 10 answers.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_feedback();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'clinical read feedback'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_feedback();
  if jsonb_array_length(r->'notes') <> 10 or r->'heard'->'answered' <> 'null'::jsonb then bad := array_append(bad, ('feedback view: ' || left(r::text, 200))); end if;
  if r::text like '%Good listener%' then bad := array_append(bad, 'comment leaked to staff'); end if;
  fbid := r->'notes'->0->>'id';
  r := public.admin_review_feedback(fbid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'review feedback'); end if;
  r := public.admin_feedback();
  if not exists (select 1 from jsonb_array_elements(r->'notes') n where n->>'id' = fbid and n->>'reviewedBy' = 'B. Bill') then bad := array_append(bad, 'not marked read'); end if;
  -- With ten answers the shares appear.
  reset role;
  for i in 1..10 loop
    insert into private.heard (conversation_id, account_id, score) values (gen_random_uuid(), ids[4], case when i <= 8 then 5 else 2 end);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_feedback();
  if (r->'heard'->>'answered')::int <> 11 or (r->'heard'->'shares'->>4)::int <> 73 then bad := array_append(bad, ('shares: ' || (r->'heard')::text)); end if;

  -- Therapist application.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_application();
  if r->>'status' <> 'none' then bad := array_append(bad, 'application before applying'); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', '', current_date + 300, true, true);
  if r->>'code' is distinct from 'licence' then bad := array_append(bad, 'blank licence'); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', 'L-123', current_date - 1, true, true);
  if r->>'code' is distinct from 'expiry' then bad := array_append(bad, 'expired licence'); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', 'L-123', current_date + 300, true, false);
  if r->>'code' is distinct from 'consent' then bad := array_append(bad, 'missing consent'); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', 'L-123', current_date + 300, true, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('apply: ' || r::text)); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', 'L-123', current_date + 300, true, true);
  if r->>'code' is distinct from 'exists' then bad := array_append(bad, 'applied twice'); end if;
  r := public.my_application();
  if r->>'status' <> 'pending' then bad := array_append(bad, 'status not pending'); end if;

  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_applicants();
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'billing read applicants'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_applicants();
  aid := (r->'applicants'->0->>'id')::uuid;
  if jsonb_array_length(r->'applicants') <> 1 or r->'applicants'->0->>'name' <> 'Dr Test Therapist' then bad := array_append(bad, ('applicants: ' || r::text)); end if;
  r := public.admin_verify_applicant(aid, 'approved', 'Welcome to Echo', '{"name":true,"licence":true,"expiry":false,"qualification":true}'::jsonb);
  if r->>'code' is distinct from 'checklist' then bad := array_append(bad, 'approved with an unticked check'); end if;
  r := public.admin_verify_applicant(aid, 'approved', 'no', '{"name":true,"licence":true,"expiry":true,"qualification":true}'::jsonb);
  if r->>'code' is distinct from 'message' then bad := array_append(bad, 'short message'); end if;
  r := public.admin_verify_applicant(aid, 'info', 'Please send a clearer licence copy', '{"name":true,"licence":false,"expiry":false,"qualification":false}'::jsonb);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('info: ' || r::text)); end if;
  r := public.admin_verify_applicant(aid, 'rejected', 'Second decision', '{}'::jsonb);
  if r->>'code' is distinct from 'decided' then bad := array_append(bad, 'decided twice'); end if;
  -- The applicant sees the request, fixes it and sends it again.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_application();
  if r->>'status' <> 'info' or r->>'message' <> 'Please send a clearer licence copy' then bad := array_append(bad, ('info status: ' || r::text)); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', 'L-123', current_date + 300, true, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('resubmit: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_verify_applicant(aid, 'approved', 'Welcome to Echo', '{"name":true,"licence":true,"expiry":true,"qualification":true}'::jsonb);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;
  reset role;
  select * into th from private.therapists where account_id = ids[4];
  if th.id is null or not th.paused or th.accepting_new or th.suspended or th.name <> 'Dr Test Therapist' then bad := array_append(bad, 'therapist not created paused'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_portal();
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approved applicant cannot open the portal: ' || left(r::text, 120))); end if;
  r := public.submit_application('Dr Test Therapist', 'Counsellor', 'woman', 'L-123', current_date + 300, true, true);
  if r->>'code' is distinct from 'therapist' then bad := array_append(bad, 'therapist applied again'); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Approved therapist') then bad := array_append(bad, 'no audit row'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL FEEDBACK AND APPLICATION CHECKS PASSED';
end;
$$;
