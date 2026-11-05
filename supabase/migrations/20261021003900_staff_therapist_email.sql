-- Therapists and staff can be linked by a confirmed email as well as a phone number. A person who signs in with Google or an email and
-- password is matched to a waiting link by the email Google or Supabase has verified. Same two-person rule for staff as with a phone.

alter table private.therapists add column if not exists link_email text;
create unique index if not exists therapists_link_email_idx on private.therapists (lower(link_email)) where link_email is not null;

create table if not exists private.staff_email_invites (
  email text primary key check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name text not null check (char_length(name) between 3 and 30),
  role text not null check (role in ('moderator', 'clinical', 'billing', 'admin')),
  created_by text not null,
  created_at timestamptz not null default now(),
  used boolean not null default false
);
alter table private.staff_email_invites enable row level security;

-- The first time a confirmed email signs in, any waiting therapist link or staff invite for it is made.
create or replace function private.link_on_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  em text;
  inv private.staff_email_invites;
begin
  if new.email is null or new.email_confirmed_at is null then return new; end if;
  em := lower(new.email);
  if not exists (select 1 from private.staff where account_id = new.id) and not exists (select 1 from private.therapists where account_id = new.id) then
    update private.therapists set account_id = new.id, link_email = null
      where lower(link_email) = em and account_id is null;
    select * into inv from private.staff_email_invites where email = em and not used;
    if found and not exists (select 1 from private.therapists where account_id = new.id) then
      insert into private.staff (account_id, name, role) values (new.id, inv.name, inv.role) on conflict do nothing;
      update private.staff_email_invites set used = true where email = inv.email;
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'echo_link_on_email' and tgrelid = 'auth.users'::regclass) then
    create trigger echo_link_on_email after insert or update of email, email_confirmed_at on auth.users
      for each row execute function private.link_on_email();
  end if;
end;
$$;

create or replace function public.admin_link_therapist_email(p_therapist text, p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.therapists;
  em text := lower(btrim(coalesce(p_email, '')));
  uid uuid;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins link therapists.'); end if;
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return private.fail('email', 'Enter an email address, like name@example.com.'); end if;
  select * into t from private.therapists where id = p_therapist;
  if not found then return private.fail('gone', 'Therapist not found.'); end if;
  if t.account_id is not null then return private.fail('linked', 'This therapist is already linked. Unlink them first.'); end if;
  if exists (select 1 from private.therapists o where o.id <> t.id and lower(o.link_email) = em) then return private.fail('taken', 'That email is waiting to be linked to another therapist.'); end if;
  select u.id into uid from auth.users u where lower(u.email) = em and u.email_confirmed_at is not null;
  if uid is not null and exists (select 1 from private.staff st where st.account_id = uid) then return private.fail('staff', 'That email belongs to a staff account.'); end if;
  if uid is not null and exists (select 1 from private.therapists o where o.account_id = uid) then return private.fail('taken', 'That email is linked to another therapist.'); end if;
  if uid is not null then
    update private.therapists set account_id = uid, link_email = null where id = t.id;
  else
    update private.therapists set link_email = em where id = t.id;
  end if;
  perform private.staff_log(s, 'Linked therapist to an email', t.name, case when uid is null then 'Waiting for the first sign-in' else 'Linked now' end);
  return jsonb_build_object('ok', true, 'pending', uid is null);
end;
$$;

-- Adding a team member by email. The work is the same as by phone, so it goes through the same proposal and approval.
create or replace function private.apply_staff_add_email(p_name text, p_role text, p_email text, p_actor private.staff) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  em text := lower(btrim(coalesce(p_email, '')));
  uid uuid;
begin
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return private.fail('email', 'Enter an email address, like name@example.com.'); end if;
  if exists (select 1 from private.staff where lower(name) = lower(p_name))
     or exists (select 1 from private.staff_invites where lower(name) = lower(p_name) and not used)
     or exists (select 1 from private.staff_email_invites where lower(name) = lower(p_name) and not used) then
    return private.fail('name', 'Someone with that name is already on the team.');
  end if;
  select u.id into uid from auth.users u where lower(u.email) = em and u.email_confirmed_at is not null;
  if uid is not null and (exists (select 1 from private.staff where account_id = uid) or exists (select 1 from private.therapists where account_id = uid)) then
    return private.fail('taken', 'That email is already linked to a staff member or a therapist.');
  end if;
  if exists (select 1 from private.therapists where lower(link_email) = em) then return private.fail('taken', 'That email is waiting to be linked to a therapist.'); end if;
  if uid is not null then
    insert into private.staff (account_id, name, role) values (uid, p_name, p_role);
  else
    insert into private.staff_email_invites (email, name, role, created_by) values (em, p_name, p_role, p_actor.name)
      on conflict (email) do update set name = excluded.name, role = excluded.role, created_by = excluded.created_by, created_at = now(), used = false;
  end if;
  perform private.staff_log(p_actor, 'Added team member', p_name, 'Role ' || p_role || ', by email');
  return jsonb_build_object('ok', true);
end;
$$;

select private.patch_function('private.apply_staff_change(text, jsonb, private.staff)'::regprocedure,
  $p$if p_kind = 'add' then$p$,
  $p$if p_kind = 'add' and coalesce(p_payload->>'email', '') <> '' then
    return private.apply_staff_add_email(nm, rl, p_payload->>'email', p_actor);
  end if;
  if p_kind = 'add' then$p$,
  'apply_staff_add_email');

create or replace function public.admin_add_staff_email(p_name text, p_role text, p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  nm text := btrim(coalesce(p_name, ''));
  em text := lower(btrim(coalesce(p_email, '')));
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  if char_length(nm) < 3 or char_length(nm) > 30 then return private.fail('name', 'A name is 3 to 30 characters.'); end if;
  if p_role not in ('moderator', 'clinical', 'billing', 'admin') then return private.fail('role', 'Choose a role.'); end if;
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return private.fail('email', 'Enter an email address, like name@example.com.'); end if;
  if exists (select 1 from private.staff where lower(name) = lower(nm)) or exists (select 1 from private.staff_invites where lower(name) = lower(nm) and not used)
     or exists (select 1 from private.staff_email_invites where lower(name) = lower(nm) and not used) then
    return private.fail('name', 'Someone with that name is already on the team.');
  end if;
  return private.propose_staff_change('add', jsonb_build_object('name', nm, 'role', p_role, 'email', em), 'Add ' || nm || ' as ' || p_role || ' (by email)', null, s);
end;
$$;

-- A proposal keeps the email only while it waits: once it is decided, withdrawn or lapsed, the address is removed from it.
create or replace function private.scrub_staff_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'pending' then new.payload := new.payload - 'email'; end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'echo_scrub_staff_change' and tgrelid = 'private.staff_changes'::regclass) then
    create trigger echo_scrub_staff_change before update on private.staff_changes
      for each row execute function private.scrub_staff_change();
  end if;
end;
$$;

create or replace function public.admin_staff_email_invites() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'invites', coalesce((
    select jsonb_agg(jsonb_build_object('hint', left(split_part(i.email, '@', 1), 2) || '…@' || split_part(i.email, '@', 2), 'name', i.name, 'role', i.role, 'by', i.created_by, 'at', private.ms(i.created_at)) order by i.created_at)
    from private.staff_email_invites i where not i.used), '[]'::jsonb));
end;
$$;

create or replace function public.admin_cancel_email_invite(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin changes the team.'); end if;
  update private.staff_email_invites set used = true where lower(name) = lower(btrim(coalesce(p_name, ''))) and not used;
  if not found then return private.fail('gone', 'That invitation isn’t waiting any more.'); end if;
  perform private.staff_log(s, 'Cancelled invitation', btrim(p_name));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_link_therapist_email(text, text), public.admin_add_staff_email(text, text, text), public.admin_staff_email_invites(), public.admin_cancel_email_invite(text) from public, anon;
grant execute on function public.admin_link_therapist_email(text, text), public.admin_add_staff_email(text, text, text), public.admin_staff_email_invites(), public.admin_cancel_email_invite(text) to authenticated;
