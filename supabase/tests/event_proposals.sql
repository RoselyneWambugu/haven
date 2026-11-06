-- Event proposals: a therapist proposes, a reviewer decides, members see only approved events. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; e1 text; e2 text; e3 text; e4 text; tname text;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471600012' || i, now(), now());
  end loop;
  -- 1 therapist (t-amina), 2 clinical reviewer, 3 moderator, 4 member with a plan
  update private.therapists set account_id = ids[1] where id = 't-amina';
  select name into tname from private.therapists where id = 't-amina';
  insert into private.staff (account_id, name, role) values (ids[2], 'C. Reviewer', 'clinical'), (ids[3], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Peter Ochieng', date '1996-06-06', null, 'CedarFern', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[4], 'monthly', now() + interval '30 days', 'mpesa', 'P-1');

  -- a member cannot propose; the therapist can, with enough notice
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_propose_event('A slow evening walk', 'An easy group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '6 days', 90);
  if r->>'code' is distinct from 'not-therapist' then bad := array_append(bad, 'member proposed: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_propose_event('A slow evening walk', 'An easy group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '1 day', 90);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'too soon accepted'); end if;
  r := public.portal_propose_event('A slow evening walk', 'An easy group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '6 days', 90);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'propose failed: ' || r::text); else e1 := r->>'id'; end if;
  r := public.portal_propose_event('Writing through grief', 'Short writing prompts for anyone carrying a loss, shared only if you choose.', 'workshop', 'online', 'The link is sent the day before', now() + interval '8 days', 75);
  e2 := r->>'id';
  r := public.portal_propose_event('Sleep talk for the restless', 'A relaxed talk on why nights get loud and a few small routines.', 'webinar', 'online', 'The link is sent the day before', now() + interval '9 days', 60);
  e3 := r->>'id';
  r := public.portal_propose_event('A fourth proposal here', 'A fourth proposal, which should be turned away for now.', 'talk', 'online', 'The link is sent the day before', now() + interval '10 days', 60);
  if r->>'code' is distinct from 'too-many' then bad := array_append(bad, 'fourth waiting proposal accepted: ' || r::text); end if;
  r := public.portal_events();
  if jsonb_array_length(r->'events') <> 3 or exists (select 1 from jsonb_array_elements(r->'events') x where x->>'status' <> 'pending') then bad := array_append(bad, 'portal list wrong: ' || r::text); end if;
  r := public.portal_withdraw_event(e3::uuid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'withdraw failed'); end if;
  reset role;

  -- members see no proposal, and cannot be interested in one
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.event_list();
  if exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' in (e1, e2, e3)) then bad := array_append(bad, 'member sees a proposal'); end if;
  r := public.event_toggle_interest(e1::uuid);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'interest in a proposal'); end if;
  reset role;

  -- a moderator cannot decide; the reviewer approves one and declines another (with a reason)
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_event(e1::uuid, true, null);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator decided'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_events();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = e1 and x->>'status' = 'pending' and x->>'proposedBy' = tname) then bad := array_append(bad, 'staff do not see the proposal'); end if;
  r := public.admin_cancel_event(e1::uuid, 'Cancelling a proposal');
  if r->>'code' is distinct from 'not-live' then bad := array_append(bad, 'cancelled a proposal: ' || r::text); end if;
  r := public.admin_decide_event(e2::uuid, false, 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'decline without reason'); end if;
  r := public.admin_decide_event(e2::uuid, false, 'We already have a grief workshop that week');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'decline failed: ' || r::text); end if;
  r := public.admin_decide_event(e1::uuid, true, null);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'approve failed: ' || r::text); end if;
  r := public.admin_decide_event(e1::uuid, true, null);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'decided twice'); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Approved event proposal' and actor = 'C. Reviewer') then bad := array_append(bad, 'approval not logged'); end if;

  -- the approved event is now live for members, with the therapist as host; the declined one gives the therapist the reason
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.event_list();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = e1 and x->>'host' = tname and x->>'proposedBy' = tname) then bad := array_append(bad, 'approved event not live'); end if;
  if exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = e2) then bad := array_append(bad, 'declined event shown'); end if;
  r := public.event_toggle_interest(e1::uuid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'cannot be interested in approved'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_events();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = e2 and x->>'status' = 'declined' and x->>'declineReason' like 'We already have%') then bad := array_append(bad, 'therapist cannot read the reason'); end if;
  r := public.portal_withdraw_event(e1::uuid);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'withdrew a live event'); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
