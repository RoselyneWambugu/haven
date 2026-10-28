-- Checks for two-person approval of team changes. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; cid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (ids[1], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000101', now(), now()),
    (ids[2], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000102', now(), now()),
    (ids[3], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000103', now(), now()),
    (ids[4], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000106', now(), now());
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin One', 'admin'), (ids[2], 'A. Admin Two', 'admin'), (ids[3], 'M. Moderator', 'moderator'), (ids[4], 'A. Admin Four', 'admin');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  -- With two Admins a change waits.
  r := public.admin_set_staff(ids[3], 'clinical', null, null);
  if r->>'proposed' is distinct from 'true' then bad := array_append(bad, ('not proposed: ' || r::text)); end if;
  cid := (r->>'id')::uuid;
  reset role;
  if (select role from private.staff where account_id = ids[3]) <> 'moderator' then bad := array_append(bad, 'applied before approval'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_staff_change(cid, true);
  if r->>'code' is distinct from 'second-person' then bad := array_append(bad, ('proposer approved: ' || r::text)); end if;
  r := public.admin_add_staff('Other Person', 'billing', '0712000104');
  if r->>'code' is distinct from 'pending' then bad := array_append(bad, ('two at once: ' || r::text)); end if;
  r := public.admin_withdraw_staff_change(cid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('withdraw: ' || r::text)); end if;
  r := public.admin_set_staff(ids[3], 'clinical', null, null);
  cid := (r->>'id')::uuid;
  -- The other Admin approves.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_withdraw_staff_change(cid);
  if r->>'code' is distinct from 'not-yours' then bad := array_append(bad, ('withdrew someone else''s: ' || r::text)); end if;
  r := public.admin_staff_invites();
  if (r->'pending'->>'mine')::boolean then bad := array_append(bad, 'pending marked mine'); end if;
  r := public.admin_decide_staff_change(cid, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;
  reset role;
  if (select role from private.staff where account_id = ids[3]) <> 'clinical' then bad := array_append(bad, 'not applied after approval'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_staff_change(cid, true);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'approved twice'); end if;
  -- Decline, and a change to the approver's own account.
  r := public.admin_add_staff('Other Person', 'billing', '0712000104');
  cid := (r->>'id')::uuid;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_staff_change(cid, false);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('decline: ' || r::text)); end if;
  r := public.admin_set_staff(ids[2], null, false, null);
  if r->>'proposed' is distinct from 'true' then bad := array_append(bad, ('propose deactivation: ' || r::text)); end if;
  cid := (r->>'id')::uuid;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_staff_change(cid, true);
  if r->>'code' is distinct from 'self' then bad := array_append(bad, ('approved own deactivation: ' || r::text)); end if;
  -- Admins can't drop below two.
  reset role; update private.staff_changes set status = 'declined' where status = 'pending';
  update private.staff set active = false where account_id = ids[4];
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_staff(ids[2], null, false, null);
  if r->>'code' is distinct from 'admins' then bad := array_append(bad, ('floor: ' || r::text)); end if;
  -- The heavy queue needs no second person. A moderator can do none of this.
  r := public.admin_set_staff(ids[3], null, null, true);
  if r->>'ok' is distinct from 'true' or r->>'proposed' is not null then bad := array_append(bad, ('heavy: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_staff_change(gen_random_uuid(), true);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator decided a change'); end if;
  -- A proposal lapses after a day.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_add_staff('Late Person', 'billing', '0712000105');
  cid := (r->>'id')::uuid;
  reset role; update private.staff_changes set created_at = now() - interval '2 days' where id = cid;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_decide_staff_change(cid, true);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, ('lapsed change approved: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Approved team change') then bad := array_append(bad, 'no audit row for approval'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL TWO-PERSON CHECKS PASSED';
end;
$$;
