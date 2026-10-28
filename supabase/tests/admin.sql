-- Admin dashboard checks. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL ADMIN CHECKS PASSED". Any other text lists what failed.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  phones text[] := array['254712000061','254712000062','254712000063','254712000064','254712000065','254712000066'];
  r jsonb;
  n int;
  rep_s2 uuid; rep_s1 uuid; rep_clin uuid; concern uuid; post uuid; notice uuid; sess uuid;
  bad text[] := '{}';
  i int;
begin
  for i in 1..6 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', phones[i], now(), now());
  end loop;
  -- ids: 1 moderator, 2 heavy-queue moderator, 3 clinical reviewer, 4 member (reporter), 5 member (reported), 6 other moderator
  insert into private.staff (account_id, name, role, heavy) values
    (ids[1], 'M. Test One', 'moderator', false), (ids[2], 'M. Test Two', 'moderator', true), (ids[3], 'C. Test Three', 'clinical', false), (ids[6], 'M. Test Six', 'moderator', false);
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Reporter Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED A: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Reported Member', date '1995-05-05', null, 'LoudRiver', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED B: %', r; end if;
  reset role;

  insert into private.reports (reporter, reported, reported_name, target, reason, note, prior_reports) values (ids[4], ids[5], 'LoudRiver', 'message', 'harassment', 'rude', 0) returning id into rep_s2;
  insert into private.reports (reporter, reported, reported_name, target, reason, note, prior_reports) values (ids[4], ids[5], 'LoudRiver', 'message', 'self-harm', 'worrying', 0) returning id into rep_s1;
  insert into private.reports (reporter, reported, reported_name, target, reason, note, queue, therapist_id) values (ids[4], null, 'A therapist', 'session', 'therapist-conduct', 'bad', 'clinical', 't-amina') returning id into rep_clin;
  insert into private.concerns (therapist_id, danger, type, detail) values ('t-amina', true, 'self-harm', 'a client said so') returning id into concern;

  -- A member who is not staff is turned away.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_state();
  if r->>'code' is distinct from 'not-staff' then bad := bad || 'member got admin state'; end if;
  r := public.staff_me();
  if r->>'code' is distinct from 'not-staff' then bad := bad || 'member signed in as staff'; end if;
  r := public.admin_decide('C-r:' || rep_s2, 'dismiss', 'no reason needed');
  if r->>'ok' = 'true' then bad := bad || 'member decided a case'; end if;

  -- A moderator signs in and sees member cases but not therapist concerns.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.staff_me();
  if r->>'role' is distinct from 'moderator' then bad := bad || 'moderator sign-in'; end if;
  r := public.admin_state();
  if jsonb_array_length(r->'cases') <> 2 then bad := bad || ('moderator sees ' || jsonb_array_length(r->'cases') || ' cases'); end if;
  if exists (select 1 from jsonb_array_elements(r->'cases') c where c->>'queue' = 'clinical') then bad := bad || 'moderator sees clinical case'; end if;
  if (r->>'audit') <> '[]' then bad := bad || 'moderator reads audit'; end if;
  r := public.admin_claim('C-k:' || concern);
  if r->>'ok' = 'true' then bad := bad || 'moderator claimed a concern'; end if;
  r := public.admin_decide('C-r:' || rep_clin, 'dismiss', 'should not work');
  if r->>'ok' = 'true' then bad := bad || 'moderator decided a clinical report'; end if;

  -- The heavy queue: a moderator off the rota cannot take Severity 1.
  r := public.admin_claim('C-r:' || rep_s1);
  if r->>'code' is distinct from 'rota' then bad := bad || ('s1 rota: ' || r::text); end if;
  r := public.admin_claim('C-r:' || rep_s2);
  if r->>'ok' is distinct from 'true' then bad := bad || ('claim s2: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[6], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_claim('C-r:' || rep_s2);
  if r->>'code' is distinct from 'taken' then bad := bad || ('double claim: ' || r::text); end if;

  -- Deciding needs a reason, and the strike ladder runs warning, restriction, suspension.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide('C-r:' || rep_s2, 'strike', 'ok');
  if r->>'code' is distinct from 'reason' then bad := bad || 'short reason accepted'; end if;
  r := public.admin_decide('C-r:' || rep_s2, 'strike', 'Harassing another member');
  if r->>'ok' is distinct from 'true' then bad := bad || ('strike: ' || r::text); end if;
  reset role;
  select count(*) into n from private.notices where account_id = ids[5] and kind = 'warning';
  if n <> 1 then bad := bad || 'first strike is not a warning'; end if;
  if (select standing from public.accounts where account_id = ids[5]) <> 'good' then bad := bad || 'warning changed standing'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide('C-r:' || rep_s2, 'dismiss', 'second try');
  if r->>'code' is distinct from 'closed' then bad := bad || 'closed case decided twice'; end if;

  -- Severity 1 on the rota: suspension straight away, and the member is paused.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_claim('C-r:' || rep_s1);
  if r->>'ok' is distinct from 'true' then bad := bad || ('rota claim: ' || r::text); end if;
  r := public.admin_decide('C-r:' || rep_s1, 'strike', 'Credible threat of harm');
  if r->>'ok' is distinct from 'true' then bad := bad || ('s1 strike: ' || r::text); end if;
  reset role;
  if (select standing from public.accounts where account_id = ids[5]) <> 'paused' then bad := bad || 's1 did not pause'; end if;
  select id into notice from private.notices where account_id = ids[5] and kind = 'suspension';

  -- The member sees both notices and appeals the suspension.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_notices();
  if jsonb_array_length(r->'notices') <> 2 then bad := bad || 'member notices'; end if;
  r := public.appeal_notice(notice, 'short');
  if r->>'code' is distinct from 'short' then bad := bad || 'short appeal accepted'; end if;
  r := public.appeal_notice(notice, 'I was joking and it was misread by my friend');
  if r->>'ok' is distinct from 'true' then bad := bad || ('appeal: ' || r::text); end if;
  r := public.appeal_notice(notice, 'I was joking and it was misread by my friend');
  if r->>'code' is distinct from 'appealed' then bad := bad || 'double appeal'; end if;

  -- The person who made the decision cannot review the appeal. Someone else can.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_appeal(notice, 'reduced', 'Looked again at this');
  if r->>'code' is distinct from 'same-reviewer' then bad := bad || ('same reviewer: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[6], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_appeal(notice, 'reduced', 'The threat was not credible on review');
  if r->>'ok' is distinct from 'true' then bad := bad || ('appeal decided: ' || r::text); end if;
  reset role;
  if (select standing from public.accounts where account_id = ids[5]) <> 'restricted' then bad := bad || 'reduced suspension is not a restriction'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[6], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_appeal(notice, 'overturned', 'Trying to decide twice');
  if r->>'code' is distinct from 'decided' then bad := bad || 'appeal decided twice'; end if;

  -- Restore and restrict from the users screen.
  r := public.admin_user_action(ids[5], 'restore', 'Cleared after review');
  if r->>'ok' is distinct from 'true' then bad := bad || ('restore: ' || r::text); end if;
  reset role;
  if (select standing from public.accounts where account_id = ids[5]) <> 'good' then bad := bad || 'restore did not restore'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_user_action(ids[5], 'suspend', 'Clinical cannot do this');
  if r->>'code' is distinct from 'role' then bad := bad || 'clinical suspended a user'; end if;

  -- A clinical reviewer sees the therapist concern and acts on it.
  r := public.admin_state();
  if jsonb_array_length(r->'cases') <> 4 then bad := bad || ('clinical sees ' || jsonb_array_length(r->'cases') || ' cases'); end if;
  r := public.admin_decide('C-r:' || rep_clin, 'strike', 'Not a clinical action');
  if r->>'code' is distinct from 'action' then bad := bad || ('clinical strike: ' || r::text); end if;
  r := public.admin_decide('C-k:' || concern, 'pause-therapist', 'Pausing new clients while we look into it');
  if r->>'ok' is distinct from 'true' then bad := bad || ('pause: ' || r::text); end if;
  reset role;
  if not (select paused from private.therapists where id = 't-amina') then bad := bad || 'therapist not paused'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_lift_pause('t-amina', 'Reviewed and fine');
  if r->>'ok' is distinct from 'true' then bad := bad || ('lift: ' || r::text); end if;
  r := public.admin_suspend_therapist('t-amina', 'Serious breach of standards');
  if r->>'ok' is distinct from 'true' then bad := bad || ('suspend therapist: ' || r::text); end if;
  r := public.admin_suspend_therapist('t-amina', 'Again');
  if r->>'code' is distinct from 'already' then bad := bad || 'suspended twice'; end if;
  reset role;
  if not (select suspended from private.therapists where id = 't-amina') then bad := bad || 'therapist not suspended'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_reinstate_therapist('t-amina', 'Moderator cannot');
  if r->>'code' is distinct from 'role' then bad := bad || 'moderator reinstated a therapist'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_reinstate_therapist('t-amina', 'Appeal succeeded on review');
  if r->>'ok' is distinct from 'true' then bad := bad || ('reinstate: ' || r::text); end if;

  -- A held post waits for a moderator.
  reset role;
  insert into private.posts (author_id, topic, title, body, status, publish_after) values (ids[5], 'Anxiety', 'A held post', 'This post is waiting for review', 'pending', now() + interval '1 day') returning id into post;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_state();
  if jsonb_array_length(r->'held') <> 1 then bad := bad || 'held post not listed'; end if;
  r := public.admin_review_post(post, false, 'Breaks the guidelines');
  if r->>'ok' is distinct from 'true' then bad := bad || ('review post: ' || r::text); end if;
  reset role;
  if (select status from private.posts where id = post) <> 'hidden' then bad := bad || 'removed post not hidden'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_review_post(post, true, 'clinical cannot');
  if r->>'code' is distinct from 'role' then bad := bad || 'clinical reviewed a post'; end if;

  -- Revealing is limited to 20 a day.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  for i in 1..20 loop
    r := public.admin_reveal('C-r:' || rep_s1, 'e' || i);
    if r->>'ok' is distinct from 'true' then bad := bad || ('reveal ' || i || ': ' || r::text); end if;
  end loop;
  r := public.admin_reveal('C-r:' || rep_s1, 'e21');
  if r->>'code' is distinct from 'limit' then bad := bad || 'reveal limit'; end if;
  r := public.admin_reveal('C-r:' || rep_s1, 'e1');
  if r->>'ok' is distinct from 'true' then bad := bad || 'repeat reveal counted'; end if;

  -- The audit log recorded all of it, and only clinical reviewers and Admins read it.
  reset role;
  select count(*) into n from private.audit;
  if n < 15 then bad := bad || ('audit rows ' || n); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_state();
  if jsonb_array_length(r->'audit') < 15 then bad := bad || 'clinical cannot read audit'; end if;

  -- Nobody outside signed-in users can call these.
  reset role; set local role anon;
  begin
    perform public.admin_state();
    bad := bad || 'anon called admin_state';
  exception when others then null;
  end;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL ADMIN CHECKS PASSED';
end;
$$;
