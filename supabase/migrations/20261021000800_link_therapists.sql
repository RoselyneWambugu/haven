-- Linking a therapist to a phone number from the admin dashboard, instead of SQL.
-- If the person already has an Echo sign-in the link is made at once. If not, the number is remembered
-- and the link is made the first time that number signs in.

alter table private.therapists add column if not exists link_phone text;

create or replace function private.link_therapist_on_signup() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.phone is not null then
    update private.therapists set account_id = new.id, link_phone = null
      where link_phone = new.phone and account_id is null
        and not exists (select 1 from private.therapists o where o.account_id = new.id);
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'echo_link_therapist' and tgrelid = 'auth.users'::regclass) then
    create trigger echo_link_therapist after insert or update of phone on auth.users
      for each row execute function private.link_therapist_on_signup();
  end if;
end;
$$;

create or replace function public.admin_link_therapist(p_therapist text, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.therapists;
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  uid uuid;
begin
  if ph like '0%' then ph := '254' || substr(ph, 2); end if;
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins link therapists.'); end if;
  if ph !~ '^254[17][0-9]{8}$' then return private.fail('phone', 'Enter a Kenyan mobile number, like 0712 345 678.'); end if;
  select * into t from private.therapists where id = p_therapist;
  if not found then return private.fail('gone', 'Therapist not found.'); end if;
  if t.account_id is not null then return private.fail('linked', 'This therapist is already linked. Unlink them first.'); end if;
  if exists (select 1 from private.therapists o where o.id <> t.id and (o.link_phone = ph or o.account_id = (select u.id from auth.users u where u.phone = ph))) then
    return private.fail('taken', 'That number is linked to another therapist.');
  end if;
  select u.id into uid from auth.users u where u.phone = ph;
  if uid is not null and exists (select 1 from private.staff st where st.account_id = uid) then return private.fail('staff', 'That number belongs to a staff account.'); end if;
  if uid is not null then
    update private.therapists set account_id = uid, link_phone = null where id = t.id;
  else
    update private.therapists set link_phone = ph where id = t.id;
  end if;
  perform private.staff_log(s, 'Linked therapist to a phone', t.name, 'Number ending ' || right(ph, 3));
  return jsonb_build_object('ok', true, 'pending', uid is null);
end;
$$;

create or replace function public.admin_unlink_therapist(p_therapist text, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.therapists;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins unlink therapists.'); end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'A reason is required.'); end if;
  select * into t from private.therapists where id = p_therapist;
  if not found then return private.fail('gone', 'Therapist not found.'); end if;
  if t.account_id is null and t.link_phone is null then return private.fail('none', 'This therapist has no linked number.'); end if;
  update private.therapists set account_id = null, link_phone = null where id = t.id;
  perform private.staff_log(s, 'Unlinked therapist from a phone', t.name, btrim(p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_therapist_links() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'links', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'linked', t.account_id is not null, 'pending', t.account_id is null and t.link_phone is not null,
      'tail', right(coalesce((select u.phone from auth.users u where u.id = t.account_id), t.link_phone, ''), 3)) order by t.name)
    from private.therapists t), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_link_therapist(text, text), public.admin_unlink_therapist(text, text), public.admin_therapist_links() from public, anon;
grant execute on function public.admin_link_therapist(text, text), public.admin_unlink_therapist(text, text), public.admin_therapist_links() to authenticated;
