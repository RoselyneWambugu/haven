-- A real second factor for staff: an authenticator app code (TOTP, through Supabase Auth's multi-factor sign-in).
-- After signing in the usual way (phone code, Google, email and password), a staff member must also enter the 6-digit code from their authenticator
-- app. Until they do, the session is "aal1" and the server refuses every staff action; once they do it becomes "aal2" and the dashboard opens.
-- A staff member with no authenticator yet sets one up on first sign-in (the app shows a QR code and a key).
-- It can't be switched off from the app. The only switch is the server's configuration (key staffMfa, required), kept for recovery.
-- Nothing here removes data.

insert into private.config (key, value) values ('staffMfa', '{"required":true}') on conflict (key) do nothing;

-- True when the signed-in session has passed the second factor (or the second factor is not required).
create or replace function private.aal_ok() returns boolean
language sql stable set search_path = ''
as $$
  select not coalesce((select (value ->> 'required')::boolean from private.config where key = 'staffMfa'), true)
         or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Who is staff, whatever the session's level. Used only to tell a person to enter their code.
create or replace function private.staff_identity(p_account uuid) returns private.staff
language sql stable set search_path = ''
as $$ select s from private.staff s where s.account_id = p_account and s.active $$;

-- Every staff action goes through this: it answers only once the second factor has passed.
create or replace function private.staff_of(p_account uuid) returns private.staff
language sql stable set search_path = ''
as $$ select s from private.staff s where s.account_id = p_account and s.active and private.aal_ok() $$;

create or replace function public.staff_me() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  i private.staff := private.staff_identity(uid);
  s private.staff;
begin
  if i.account_id is null then return private.fail('not-staff', 'This number isn’t linked to a staff account.'); end if;
  if not private.aal_ok() then return private.fail('mfa', 'Enter the code from your authenticator app.'); end if;
  s := private.staff_of(uid);
  update private.staff set last_sign_in_at = now() where account_id = uid;
  perform private.staff_log(s, 'Signed in', 'Dashboard', 'Second factor passed');
  return jsonb_build_object('ok', true, 'name', s.name, 'role', s.role, 'heavy', s.heavy);
end;
$$;

-- Opening private documents is a staff action too.
create or replace function public.can_review_documents() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.staff s where s.account_id = (select auth.uid()) and s.active and s.role in ('clinical', 'admin') and private.aal_ok()) $$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.staff_me() from public, anon;
grant execute on function public.staff_me() to authenticated;
