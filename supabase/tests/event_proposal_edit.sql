-- A therapist edits a proposal and is told when it is decided. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; e1 text;
begin
  for i in 1..2 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471700013' || i, now(), now());
  end loop;
  update private.therapists set account_id = ids[1] where id = 't-amina';
  insert into private.staff (account_id, name, role) values (ids[2], 'C. Reviewer', 'clinical');

  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_propose_event('A slow evening walk', 'An easy group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '6 days', 90);
  e1 := r->>'id';
  -- edit while waiting: the text changes and it stays waiting
  r := public.portal_edit_event(e1::uuid, 'A slow evening walk, edited', 'An easy group walk with a therapist alongside, with tea after.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '7 days', 75);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'edit failed: ' || r::text); end if;
  r := public.portal_edit_event(e1::uuid, 'Short', 'An easy group walk with a therapist alongside.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '7 days', 75);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'bad edit accepted'); end if;
  r := public.portal_edit_event(e1::uuid, 'A slow evening walk, edited', 'An easy group walk with a therapist alongside, with tea after.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '1 day', 75);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'too soon accepted on edit'); end if;
  r := public.portal_notes();
  if jsonb_array_length(r->'notes') <> 0 then bad := array_append(bad, 'a note before any decision'); end if;
  reset role;
  if (select title from private.events where id = e1::uuid) <> 'A slow evening walk, edited' then bad := array_append(bad, 'edit not saved'); end if;

  -- declined: the therapist gets a note with the reason, edits it, and it is waiting again with the reason cleared
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_decide_event(e1::uuid, false, 'Please pick a weekday evening');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'decline failed: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_notes();
  if jsonb_array_length(r->'notes') <> 1 or r->'notes'->0->>'title' <> 'Your event proposal was declined' or (r->'notes'->0->>'body') not like '%Reason: “Please pick a weekday evening”%' or (r->'notes'->0->>'read') <> 'false' then bad := array_append(bad, 'decline note wrong: ' || r::text); end if;
  r := public.portal_edit_event(e1::uuid, 'A weekday evening walk', 'An easy group walk with a therapist alongside, on a weekday evening.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '8 days', 75);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'edit of declined failed: ' || r::text); end if;
  r := public.portal_events();
  if not exists (select 1 from jsonb_array_elements(r->'events') x where x->>'id' = e1 and x->>'status' = 'pending' and not (x ? 'declineReason')) then bad := array_append(bad, 'not pending again with the reason cleared'); end if;
  reset role;

  -- approved: a second note; both can be marked read; a live event can no longer be edited
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_decide_event(e1::uuid, true, null);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'approve failed: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_notes();
  if jsonb_array_length(r->'notes') <> 2 or r->'notes'->0->>'title' <> 'Your event was approved' then bad := array_append(bad, 'approval note wrong: ' || r::text); end if;
  r := public.portal_notes_read();
  r := public.portal_notes();
  if exists (select 1 from jsonb_array_elements(r->'notes') x where x->>'read' = 'false') then bad := array_append(bad, 'notes not marked read'); end if;
  r := public.portal_edit_event(e1::uuid, 'A weekday evening walk', 'An easy group walk with a therapist alongside, on a weekday evening.', 'walk', 'in-person', 'Karura Forest, main gate', now() + interval '8 days', 75);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'live event edited: ' || r::text); end if;
  reset role;

  -- someone else's notes are not visible to a member
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_notes();
  if r->>'code' is distinct from 'not-therapist' then bad := array_append(bad, 'staff can read therapist notes'); end if;
  reset role;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
