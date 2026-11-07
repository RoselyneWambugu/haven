-- Therapist-scheduled group chats. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL PASSED (rolled back)". Any other text lists what failed.
do $$
declare
  tuid uuid := gen_random_uuid();
  muid uuid := gen_random_uuid();
  r jsonb;
  bad text[] := '{}';
  gid text;
  gid2 text;
  st timestamptz := date_trunc('hour', now()) + interval '2 days 3 hours';
  n int;
  tid text := (select t.id from private.therapists t where not t.suspended and not t.paused and not exists (select 1 from private.group_chats g where g.facilitator_id = t.id) order by t.id limit 1);
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (tuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000061', now(), now()),
    (muid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000062', now(), now());
  update private.therapists set account_id = tuid where id = tid;

  -- a member can't schedule
  perform set_config('request.jwt.claims', json_build_object('sub', muid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_schedule_group('Evenings that feel heavy', 'A calm hour to talk about long evenings.', st, 60, 10);
  if r->>'code' is distinct from 'not-therapist' then bad := bad || ('member: ' || r::text); end if;

  -- the therapist can
  perform set_config('request.jwt.claims', json_build_object('sub', tuid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := public.portal_schedule_group('Evenings that feel heavy', 'A calm hour to talk about long evenings.', st, 60, 10);
  if r->>'ok' is distinct from 'true' then bad := bad || ('schedule: ' || r::text); end if;
  gid := r->>'id';
  -- clinical words, short blurb, too soon, bad length, bad size, overlap
  r := public.portal_schedule_group('Group treatment circle', 'A calm hour to talk about long evenings.', st + interval '1 day', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('clinical: ' || r::text); end if;
  r := public.portal_schedule_group('Short blurb room', 'too short', st + interval '1 day', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('blurb: ' || r::text); end if;
  r := public.portal_schedule_group('Starts too soon', 'A calm hour to talk about long evenings.', now() + interval '10 minutes', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('soon: ' || r::text); end if;
  r := public.portal_schedule_group('Runs too long', 'A calm hour to talk about long evenings.', st + interval '1 day', 120, 10);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('long: ' || r::text); end if;
  r := public.portal_schedule_group('Too many places', 'A calm hour to talk about long evenings.', st + interval '1 day', 60, 40);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('size: ' || r::text); end if;
  r := public.portal_schedule_group('Overlapping hour', 'A calm hour to talk about long evenings.', st + interval '30 minutes', 60, 10);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('overlap: ' || r::text); end if;

  -- limit of 3 upcoming
  r := public.portal_schedule_group('Second quiet hour', 'A calm hour to talk about long evenings.', st + interval '1 day', 60, 10);
  gid2 := r->>'id';
  r := public.portal_schedule_group('Third quiet hour', 'A calm hour to talk about long evenings.', st + interval '2 days', 60, 10);
  if r->>'ok' is distinct from 'true' then bad := bad || ('third: ' || r::text); end if;
  r := public.portal_schedule_group('Fourth quiet hour', 'A calm hour to talk about long evenings.', st + interval '3 days', 60, 10);
  if r->>'code' is distinct from 'limit' then bad := bad || ('limit: ' || r::text); end if;

  -- edit: ok, then not below signed-up count
  r := public.portal_edit_group(gid, 'Evenings that feel heavy', 'Now with a better description of the hour.', st, 45, 12);
  if r->>'ok' is distinct from 'true' then bad := bad || ('edit: ' || r::text); end if;
  reset role;
  insert into private.group_members (group_id, account_id) select gid, muid;
  insert into private.group_members (group_id, account_id) select gid, tuid;
  perform set_config('request.jwt.claims', json_build_object('sub', tuid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_edit_group(gid, 'Evenings that feel heavy', 'Now with a better description of the hour.', st, 45, 4);
  if r->>'ok' is distinct from 'true' then bad := bad || ('edit at count: ' || r::text); end if;
  r := public.portal_edit_group(gid, 'Evenings that feel heavy', 'Now with a better description of the hour.', st, 45, 4);
  reset role;
  select count(*) into n from private.group_members where group_id = gid;
  if n <> 2 then bad := bad || 'members kept'; end if;

  -- another therapist can't touch it
  perform set_config('request.jwt.claims', json_build_object('sub', muid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_cancel_group(gid, 'Not mine to cancel');
  if r->>'ok' = 'true' then bad := bad || 'stranger cancelled'; end if;
  reset role;

  -- cancel: needs a reason, then works, then can't repeat
  perform set_config('request.jwt.claims', json_build_object('sub', tuid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_cancel_group(gid2, 'no');
  if r->>'code' is distinct from 'reason' then bad := bad || ('reason: ' || r::text); end if;
  r := public.portal_cancel_group(gid2, 'I am unwell that day');
  if r->>'ok' is distinct from 'true' then bad := bad || ('cancel: ' || r::text); end if;
  r := public.portal_cancel_group(gid2, 'I am unwell that day');
  if r->>'code' is distinct from 'cancelled' then bad := bad || ('again: ' || r::text); end if;
  reset role;
  if not exists (select 1 from private.audit where role = 'therapist' and action = 'Scheduled group chat') then bad := bad || 'audit'; end if;

  -- a paused therapist can't schedule
  update private.therapists set paused = true where id = tid;
  perform set_config('request.jwt.claims', json_build_object('sub', tuid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.portal_schedule_group('Fifth quiet hour', 'A calm hour to talk about long evenings.', st + interval '5 days', 60, 10);
  if r->>'code' is distinct from 'paused' then bad := bad || ('paused: ' || r::text); end if;
  reset role;

  if array_length(bad, 1) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
