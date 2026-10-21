-- Adding and managing staff from the dashboard, instead of SQL. Admins only.
-- A person who has already signed in to Echo becomes staff at once. Anyone else is invited by phone number
-- and becomes staff the first time that number signs in.

create table if not exists private.staff_invites (
  phone text primary key,
  name text not null check (char_length(name) between 3 and 30),
  role text not null check (role in ('moderator', 'clinical', 'billing', 'admin')),
  created_by text not null,
  created_at timestamptz not null default now(),
  used boolean not null default false
);
alter table private.staff_invites enable row level security;

create or replace function private.staff_on_signup() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare inv private.staff_invites;
begin
  if new.phone is null then return new; end if;
  select * into inv from private.staff_invites where phone = new.phone and not used;
  if found and not exists (select 1 from private.staff where account_id = new.id) and not exists (select 1 from private.therapists where account_id = new.id) then
    insert into private.staff (account_id, name, role) values (new.id, inv.name, inv.role) on conflict do nothing;
    update private.staff_invites set used = true where phone = inv.phone;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'echo_staff_invite' and tgrelid = 'auth.users'::regclass) then
    create trigger echo_staff_invite after insert or update of phone on auth.users
      for each row execute function private.staff_on_signup();
  end if;
end;
$$;

create or replace function private.active_admins(p_except uuid default null) returns int
language sql stable set search_path = ''
as $$ select count(*)::int from private.staff where active and role = 'admin' and account_id is distinct from p_except $$;

create or replace function public.admin_add_staff(p_name text, p_role text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  nm text := btrim(coalesce(p_name, ''));
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  uid uuid;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  if ph like '0%' then ph := '254' || substr(ph, 2); end if;
  if char_length(nm) < 3 or char_length(nm) > 30 then return private.fail('name', 'A name is 3 to 30 characters.'); end if;
  if p_role not in ('moderator', 'clinical', 'billing', 'admin') then return private.fail('role', 'Choose a role.'); end if;
  if ph !~ '^254[17][0-9]{8}$' then return private.fail('phone', 'Enter a Kenyan mobile number, like 0712 345 678.'); end if;
  if exists (select 1 from private.staff where lower(name) = lower(nm)) or exists (select 1 from private.staff_invites where lower(name) = lower(nm) and not used) then
    return private.fail('name', 'Someone with that name is already on the team.');
  end if;
  select u.id into uid from auth.users u where u.phone = ph;
  if uid is not null and (exists (select 1 from private.staff where account_id = uid) or exists (select 1 from private.therapists where account_id = uid)) then
    return private.fail('taken', 'That number is already linked to a staff member or a therapist.');
  end if;
  if exists (select 1 from private.therapists where link_phone = ph) then return private.fail('taken', 'That number is waiting to be linked to a therapist.'); end if;
  if uid is not null then
    insert into private.staff (account_id, name, role) values (uid, nm, p_role);
  else
    insert into private.staff_invites (phone, name, role, created_by) values (ph, nm, p_role, s.name)
      on conflict (phone) do update set name = excluded.name, role = excluded.role, created_by = excluded.created_by, created_at = now(), used = false;
  end if;
  perform private.staff_log(s, 'Added team member', nm, 'Role ' || p_role || ', number ending ' || right(ph, 3));
  return jsonb_build_object('ok', true, 'pending', uid is null);
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
  if t.role = 'admin' and t.active and (new_role <> 'admin' or not new_active) and private.active_admins(t.account_id) < 2 then
    return private.fail('admins', 'Keep at least 2 active Admins, so every sensitive change can have a second approver.');
  end if;
  update private.staff set role = new_role, active = new_active, heavy = coalesce(p_heavy, heavy) where account_id = t.account_id;
  if new_role is distinct from t.role then perform private.staff_log(s, 'Changed role', t.name, t.role || ' to ' || new_role); end if;
  if new_active is distinct from t.active then perform private.staff_log(s, case when new_active then 'Reactivated team member' else 'Deactivated team member' end, t.name); end if;
  if p_heavy is not null and p_heavy is distinct from t.heavy then perform private.staff_log(s, case when p_heavy then 'Added to heavy queue' else 'Removed from heavy queue' end, t.name); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_staff_invites() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('tail', right(i.phone, 3), 'name', i.name, 'role', i.role, 'by', i.created_by, 'at', private.ms(i.created_at)) order by i.created_at)
      from private.staff_invites i where not i.used), '[]'::jsonb),
    'heavy', coalesce((select jsonb_object_agg(x.account_id::text, x.heavy) from private.staff x), '{}'::jsonb));
end;
$$;

create or replace function public.admin_cancel_invite(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  i private.staff_invites;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  select * into i from private.staff_invites where lower(name) = lower(btrim(coalesce(p_name, ''))) and not used;
  if not found then return private.fail('gone', 'That invitation is gone.'); end if;
  update private.staff_invites set used = true where phone = i.phone;
  perform private.staff_log(s, 'Cancelled invitation', i.name);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_add_staff(text, text, text), public.admin_set_staff(uuid, text, boolean, boolean), public.admin_staff_invites(), public.admin_cancel_invite(text) from public, anon;
grant execute on function public.admin_add_staff(text, text, text), public.admin_set_staff(uuid, text, boolean, boolean), public.admin_staff_invites(), public.admin_cancel_invite(text) to authenticated;
