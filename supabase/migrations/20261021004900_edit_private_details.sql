-- A member edits their own full name and contact email. Date of birth and ID cannot be changed here (the age band and the under-18 rule depend on
-- the date), and the phone number is changed under Sign-in methods. A new name means the ID no longer matches, so it is marked unverified.
-- An email that is how the member signs in (Google or email and password) is changed under Sign-in methods, where it is confirmed.

alter table private.identities add column if not exists details_changed_at timestamptz;

create or replace function public.update_my_details(p_full_name text, p_email text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  i private.identities;
  v_full text := btrim(coalesce(p_full_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_pen text;
  v_problem jsonb;
  v_auth_email text;
begin
  select * into i from private.identities where account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  if char_length(v_full) < 2 then return private.fail('name', 'Enter your full name.'); end if;
  if char_length(v_full) > 120 then return private.fail('name', 'Keep your name under 120 characters.'); end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return private.fail('email', 'That email doesn’t look right. You can leave it blank.');
  end if;
  select u.email into v_auth_email from auth.users u where u.id = uid;
  if v_auth_email is not null and lower(coalesce(v_email, '')) <> lower(coalesce(i.email, '')) then
    return private.fail('sign-in-email', 'Your email is how you sign in. Change it under Sign-in methods.');
  end if;
  -- A pen name may not contain a part of the real name.
  select pen_name into v_pen from public.profiles where account_id = uid;
  if v_pen is not null and v_full <> i.full_name then
    v_problem := private.pen_name_problem(v_pen, v_full);
    if v_problem is not null then return private.fail('name', 'Part of that name is in your pen name. Change your pen name first, then update your name.'); end if;
  end if;
  update private.identities
    set full_name = v_full, email = v_email, details_changed_at = now(), id_verified = case when v_full <> full_name then false else id_verified end
    where account_id = uid;
  return jsonb_build_object('ok', true, 'id_verified', case when v_full <> i.full_name then false else i.id_verified end);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.update_my_details(text, text) from public, anon;
grant execute on function public.update_my_details(text, text) to authenticated;
