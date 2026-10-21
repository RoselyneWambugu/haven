-- Two-person approval for team changes. An Admin proposes a change (add a person, change a role, deactivate or reactivate);
-- a different Admin approves it, and only then does it happen. One change waits at a time, and a proposal lapses after a day.
-- While there is only one active Admin there is nobody to approve, so changes apply at once.

create table if not exists private.staff_changes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('add', 'role', 'active')),
  payload jsonb not null,
  summary text not null,
  subject uuid,
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired', 'failed')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
alter table private.staff_changes enable row level security;

create or replace function private.expire_staff_changes() returns void
language sql set search_path = ''
as $$ update private.staff_changes set status = 'expired', decided_at = now() where status = 'pending' and created_at < now() - interval '1 day' $$;

-- Does the work of a change. Checks everything again, because time has passed since it was proposed.
create or replace function private.apply_staff_change(p_kind text, p_payload jsonb, p_actor private.staff) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  nm text := btrim(coalesce(p_payload->>'name', ''));
  ph text := regexp_replace(coalesce(p_payload->>'phone', ''), '\D', '', 'g');
  rl text := p_payload->>'role';
  uid uuid;
  t private.staff;
  new_role text;
  new_active boolean;
begin
  if p_kind = 'add' then
    if ph like '0%' then ph := '254' || substr(ph, 2); end if;
    if exists (select 1 from private.staff where lower(name) = lower(nm)) or exists (select 1 from private.staff_invites where lower(name) = lower(nm) and not used) then
      return private.fail('name', 'Someone with that name is already on the team.');
    end if;
    select u.id into uid from auth.users u where u.phone = ph;
    if uid is not null and (exists (select 1 from private.staff where account_id = uid) or exists (select 1 from private.therapists where account_id = uid)) then
      return private.fail('taken', 'That number is already linked to a staff member or a therapist.');
    end if;
    if exists (select 1 from private.therapists where link_phone = ph) then return private.fail('taken', 'That number is waiting to be linked to a therapist.'); end if;
    if uid is not null then
      insert into private.staff (account_id, name, role) values (uid, nm, rl);
    else
      insert into private.staff_invites (phone, name, role, created_by) values (ph, nm, rl, p_actor.name)
        on conflict (phone) do update set name = excluded.name, role = excluded.role, created_by = excluded.created_by, created_at = now(), used = false;
    end if;
    perform private.staff_log(p_actor, 'Added team member', nm, 'Role ' || rl || ', number ending ' || right(ph, 3));
    return jsonb_build_object('ok', true);
  end if;

  select * into t from private.staff where account_id = (p_payload->>'account')::uuid;
  if not found then return private.fail('gone', 'That person isn’t on the team.'); end if;
  new_role := coalesce(p_payload->>'role', t.role);
  new_active := coalesce((p_payload->>'active')::boolean, t.active);
  if t.role = 'admin' and t.active and (new_role <> 'admin' or not new_active) and private.active_admins(t.account_id) < 2 then
    return private.fail('admins', 'Keep at least 2 active Admins, so every sensitive change can have a second approver.');
  end if;
  update private.staff set role = new_role, active = new_active where account_id = t.account_id;
  if new_role is distinct from t.role then perform private.staff_log(p_actor, 'Changed role', t.name, t.role || ' to ' || new_role); end if;
  if new_active is distinct from t.active then perform private.staff_log(p_actor, case when new_active then 'Reactivated team member' else 'Deactivated team member' end, t.name); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Records a proposal, or applies it straight away when there is nobody else who could approve.
create or replace function private.propose_staff_change(p_kind text, p_payload jsonb, p_summary text, p_subject uuid, p_actor private.staff) returns jsonb
language plpgsql set search_path = ''
as $$
declare r jsonb; cid uuid;
begin
  perform private.expire_staff_changes();
  if private.active_admins(p_actor.account_id) = 0 then
    r := private.apply_staff_change(p_kind, p_payload, p_actor);
    if r->>'ok' = 'true' then perform private.staff_log(p_actor, 'Applied without a second approver', p_summary, 'Only one active Admin'); end if;
    return r || jsonb_build_object('applied', true);
  end if;
  if exists (select 1 from private.staff_changes where status = 'pending') then
    return private.fail('pending', 'Another team change is waiting for a second Admin. Decide or withdraw it first.');
  end if;
  insert into private.staff_changes (kind, payload, summary, subject, requested_by, requested_name)
    values (p_kind, p_payload, p_summary, p_subject, p_actor.account_id, p_actor.name) returning id into cid;
  perform private.staff_log(p_actor, 'Proposed team change', p_summary);
  return jsonb_build_object('ok', true, 'proposed', true, 'id', cid);
end;
$$;

create or replace function public.admin_add_staff(p_name text, p_role text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  nm text := btrim(coalesce(p_name, ''));
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  if ph like '0%' then ph := '254' || substr(ph, 2); end if;
  if char_length(nm) < 3 or char_length(nm) > 30 then return private.fail('name', 'A name is 3 to 30 characters.'); end if;
  if p_role not in ('moderator', 'clinical', 'billing', 'admin') then return private.fail('role', 'Choose a role.'); end if;
  if ph !~ '^254[17][0-9]{8}$' then return private.fail('phone', 'Enter a Kenyan mobile number, like 0712 345 678.'); end if;
  if exists (select 1 from private.staff where lower(name) = lower(nm)) or exists (select 1 from private.staff_invites where lower(name) = lower(nm) and not used) then
    return private.fail('name', 'Someone with that name is already on the team.');
  end if;
  return private.propose_staff_change('add', jsonb_build_object('name', nm, 'role', p_role, 'phone', ph), 'Add ' || nm || ' as ' || p_role, null, s);
end;
$$;

create or replace function public.admin_set_staff(p_account uuid, p_role text, p_active boolean, p_heavy boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.staff;
  new_role text;
  new_active boolean;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  select * into t from private.staff where account_id = p_account;
  if not found then return private.fail('gone', 'That person isn’t on the team.'); end if;
  if t.account_id = s.account_id then return private.fail('self', 'You can’t change your own account. Ask another Admin.'); end if;
  new_role := coalesce(p_role, t.role);
  new_active := coalesce(p_active, t.active);
  if new_role not in ('moderator', 'clinical', 'billing', 'admin') then return private.fail('role', 'Choose a role.'); end if;
  -- The heavy-queue rota is a working arrangement, not an access change, so one Admin can set it.
  if p_heavy is not null and p_heavy is distinct from t.heavy then
    update private.staff set heavy = p_heavy where account_id = t.account_id;
    perform private.staff_log(s, case when p_heavy then 'Added to heavy queue' else 'Removed from heavy queue' end, t.name);
  end if;
  if new_role = t.role and new_active = t.active then return jsonb_build_object('ok', true); end if;
  if t.role = 'admin' and t.active and (new_role <> 'admin' or not new_active) and private.active_admins(t.account_id) < 2 then
    return private.fail('admins', 'Keep at least 2 active Admins, so every sensitive change can have a second approver.');
  end if;
  return private.propose_staff_change(
    case when new_role <> t.role then 'role' else 'active' end,
    jsonb_build_object('account', t.account_id, 'role', case when new_role <> t.role then new_role end, 'active', case when new_active <> t.active then new_active end),
    case when new_role <> t.role then 'Make ' || t.name || ' ' || new_role when new_active then 'Reactivate ' || t.name else 'Deactivate ' || t.name end,
    t.account_id, s);
end;
$$;

create or replace function public.admin_decide_staff_change(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.staff_changes;
  r jsonb;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  perform private.expire_staff_changes();
  select * into c from private.staff_changes where id = p_id for update;
  if not found or c.status <> 'pending' then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by = s.account_id then return private.fail('second-person', 'A second Admin must decide this, not the person who proposed it.'); end if;
  if c.subject = s.account_id then return private.fail('self', 'You can’t approve a change to your own account.'); end if;
  if not p_approve then
    update private.staff_changes set status = 'declined', decided_by = s.name, decided_at = now(), payload = payload - 'phone' where id = c.id;
    perform private.staff_log(s, 'Declined team change', c.summary);
    return jsonb_build_object('ok', true);
  end if;
  r := private.apply_staff_change(c.kind, c.payload, s);
  update private.staff_changes set status = case when r->>'ok' = 'true' then 'approved' else 'failed' end, decided_by = s.name, decided_at = now(), payload = payload - 'phone' where id = c.id;
  if r->>'ok' = 'true' then perform private.staff_log(s, 'Approved team change', c.summary, 'Proposed by ' || c.requested_name); end if;
  return r;
end;
$$;

create or replace function public.admin_withdraw_staff_change(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.staff_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  select * into c from private.staff_changes where id = p_id and status = 'pending' for update;
  if not found then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by <> s.account_id then return private.fail('not-yours', 'Only the person who proposed it can withdraw it. Another Admin can decline it.'); end if;
  update private.staff_changes set status = 'withdrawn', decided_by = s.name, decided_at = now(), payload = payload - 'phone' where id = c.id;
  perform private.staff_log(s, 'Withdrew team change', c.summary);
  return jsonb_build_object('ok', true);
end;
$$;

-- The invitations screen also needs the change waiting for approval.
create or replace function public.admin_staff_invites() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Not allowed.'); end if;
  perform private.expire_staff_changes();
  return jsonb_build_object('ok', true,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('tail', right(i.phone, 3), 'name', i.name, 'role', i.role, 'by', i.created_by, 'at', private.ms(i.created_at)) order by i.created_at)
      from private.staff_invites i where not i.used), '[]'::jsonb),
    'heavy', coalesce((select jsonb_object_agg(x.account_id::text, x.heavy) from private.staff x), '{}'::jsonb),
    'pending', (select jsonb_build_object('id', c.id, 'summary', c.summary, 'requestedBy', c.requested_name, 'mine', c.requested_by = s.account_id, 'at', private.ms(c.created_at))
                from private.staff_changes c where c.status = 'pending' order by c.created_at desc limit 1));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_decide_staff_change(uuid, boolean), public.admin_withdraw_staff_change(uuid) from public, anon;
grant execute on function public.admin_decide_staff_change(uuid, boolean), public.admin_withdraw_staff_change(uuid) to authenticated;
