-- One person, one account: a member who signed up with a phone number can add Google or an email and password to the same account, and
-- one who signed up with Google or an email can add a phone number. Supabase Auth does the linking; this copies what it now knows
-- (a confirmed email, a verified phone) into Echo's private record, so M-Pesa, text reminders and the private-profile check can use it.

create or replace function public.sync_sign_in_methods() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  u auth.users;
  ph text;
begin
  select * into u from auth.users where id = uid;
  if not exists (select 1 from private.identities where account_id = uid) then return jsonb_build_object('ok', true); end if;
  if u.email is not null and u.email_confirmed_at is not null then
    update private.identities set email = u.email where account_id = uid and coalesce(email, '') = '' and u.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
  end if;
  if u.phone is not null and u.phone_confirmed_at is not null then
    ph := case when left(u.phone, 1) = '+' then u.phone else '+' || u.phone end;
    if ph ~ '^\+254[17][0-9]{8}$' then
      begin
        update private.identities set phone = ph where account_id = uid and phone is null;
      exception when unique_violation then
        return private.fail('phone-taken', 'That number is already on another Echo account.');
      end;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.sync_sign_in_methods() from public, anon;
grant execute on function public.sync_sign_in_methods() to authenticated;
