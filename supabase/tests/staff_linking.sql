-- Checks for adding and managing staff from the dashboard. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (ids[1], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000081', now(), now()),
    (ids[2], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000082', now(), now()),
    (ids[3], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000083', now(), now());
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin One', 'admin'), (ids[2], 'M. Mod Two', 'moderator');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_add_staff('New Person', 'moderator', '0712000084');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator added staff'); end if;
  r := public.admin_set_staff(ids[1], 'moderator', null, null);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator changed staff'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_add_staff('NP', 'moderator', '0712000084');
  if r->>'code' is distinct from 'name' then bad := array_append(bad, 'short name'); end if;
  r := public.admin_add_staff('New Person', 'janitor', '0712000084');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'bad role'); end if;
  r := public.admin_add_staff('New Person', 'moderator', '123');
  if r->>'code' is distinct from 'phone' then bad := array_append(bad, 'bad phone'); end if;
  r := public.admin_add_staff('M. Mod Two', 'moderator', '0712000084');
  if r->>'code' is distinct from 'name' then bad := array_append(bad, 'duplicate name'); end if;
  r := public.admin_add_staff('Existing User', 'billing', '0712000083');
  if r->>'ok' is distinct from 'true' or (r->>'pending')::boolean then bad := array_append(bad, ('existing user: ' || r::text)); end if;
  r := public.admin_add_staff('Another One', 'billing', '0712000083');
  if r->>'code' is distinct from 'taken' then bad := array_append(bad, ('same number: ' || r::text)); end if;
  r := public.admin_add_staff('Invited Person', 'clinical', '+254 712 000 085');
  if r->>'ok' is distinct from 'true' or not (r->>'pending')::boolean then bad := array_append(bad, ('invite: ' || r::text)); end if;
  r := public.admin_staff_invites();
  if jsonb_array_length(r->'invites') <> 1 or r->'invites'->0->>'tail' <> '085' then bad := array_append(bad, ('invites list: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.staff where account_id = ids[3] and role = 'billing') then bad := array_append(bad, 'existing user not staff'); end if;
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[4], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712000085', now(), now());
  if not exists (select 1 from private.staff where account_id = ids[4] and role = 'clinical' and name = 'Invited Person') then bad := array_append(bad, 'invite not applied on sign-up'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_staff_invites();
  if jsonb_array_length(r->'invites') <> 0 then bad := array_append(bad, 'used invite still listed'); end if;
  r := public.admin_set_staff(ids[1], 'moderator', null, null);
  if r->>'code' is distinct from 'self' then bad := array_append(bad, 'changed self'); end if;
  r := public.admin_set_staff(ids[2], 'clinical', null, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('change role: ' || r::text)); end if;
  r := public.admin_set_staff(ids[2], null, false, null);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('deactivate: ' || r::text)); end if;
  reset role;
  if (select active from private.staff where account_id = ids[2]) then bad := array_append(bad, 'not deactivated'); end if;
  if (private.staff_of(ids[2])).account_id is not null then bad := array_append(bad, 'deactivated person still staff'); end if;
  -- Only one active Admin: promoting a second then demoting is allowed, but the last two cannot both go.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_staff(ids[3], 'admin', null, null);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('promote: ' || r::text)); end if;
  r := public.admin_set_staff(ids[3], 'billing', null, null);
  if r->>'code' is distinct from 'admins' then bad := array_append(bad, ('last-admin floor: ' || r::text)); end if;
  r := public.admin_add_staff('Cancel Me', 'moderator', '0712000086');
  r := public.admin_cancel_invite('cancel me');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('cancel invite: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Added team member') or not exists (select 1 from private.audit where action = 'Deactivated team member') then bad := array_append(bad, 'audit rows missing'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL STAFF LINKING CHECKS PASSED';
end;
$$;
