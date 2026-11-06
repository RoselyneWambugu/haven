-- Community events: who can schedule, what members see, interest counts, cancelling. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; eid text;
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471500011' || i, now(), now());
  end loop;
  -- 1 clinical reviewer, 2 moderator, 3 member A (with a plan), 4 member B (no plan)
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Reviewer', 'clinical'), (ids[2], 'M. Mod', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Amina Wairimu', date '1996-06-06', null, 'RiverMoss', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Peter Ochieng', date '1996-06-06', null, 'CedarFern', 'sun', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[3], 'monthly', now() + interval '30 days', 'mpesa', 'E-1');

  -- a moderator cannot schedule; a clinical reviewer can, once the details are right
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_schedule_event('A walk in the park', 'An easy, unhurried group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '2 days', 90, 'Echo');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator scheduled: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_schedule_event('Short', 'An easy, unhurried group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '2 days', 90, 'Echo');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short title accepted'); end if;
  r := public.admin_schedule_event('A walk in the park', 'An easy, unhurried group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '10 minutes', 90, 'Echo');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'too soon accepted'); end if;
  r := public.admin_schedule_event('A walk in the park', 'An easy, unhurried group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '2 days', 90, 'Echo');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'schedule failed: ' || r::text); else eid := r->>'id'; end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Scheduled event' and actor = 'C. Reviewer') then bad := array_append(bad, 'not logged'); end if;

  -- a member without a plan sees nothing; with a plan sees it, and the count moves
  perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.event_list();
  if r->>'code' is distinct from 'needs-plan' then bad := array_append(bad, 'no plan but listed'); end if;
  r := public.event_toggle_interest(eid::uuid);
  if r->>'code' is distinct from 'needs-plan' then bad := array_append(bad, 'no plan but interested'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.event_list();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = eid and (x->>'interested')::int = 0) then bad := array_append(bad, 'event not listed'); end if;
  if exists (select 1 from jsonb_array_elements(r->'events') x where x ? 'createdBy') then bad := array_append(bad, 'member sees who scheduled it'); end if;
  r := public.event_toggle_interest(eid::uuid);
  if (r->>'count')::int <> 1 or r->>'interested' <> 'true' then bad := array_append(bad, 'interest on: ' || r::text); end if;
  r := public.event_toggle_interest(eid::uuid);
  if (r->>'count')::int <> 0 or r->>'interested' <> 'false' then bad := array_append(bad, 'interest off: ' || r::text); end if;
  r := public.event_toggle_interest(eid::uuid);
  reset role;

  -- a member cannot cancel; the reviewer needs a reason; then the event shows as cancelled and takes no more interest
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_cancel_event(eid::uuid, 'Trying to cancel');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'member cancelled'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_cancel_event(eid::uuid, 'no');
  if r->>'code' is distinct from 'reason' then bad := array_append(bad, 'no reason accepted'); end if;
  r := public.admin_cancel_event(eid::uuid, 'The speaker is unwell');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'cancel failed: ' || r::text); end if;
  r := public.admin_cancel_event(eid::uuid, 'Again, once more');
  if r->>'code' is distinct from 'cancelled' then bad := array_append(bad, 'cancelled twice'); end if;
  r := public.admin_events();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = eid and x->>'createdBy' = 'C. Reviewer') then bad := array_append(bad, 'staff list missing createdBy'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.event_list();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = eid and x->'cancelled'->>'reason' = 'The speaker is unwell') then bad := array_append(bad, 'cancelled not shown with reason'); end if;
  r := public.event_toggle_interest(eid::uuid);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'interest in cancelled event'); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
