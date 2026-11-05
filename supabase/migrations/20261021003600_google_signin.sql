-- Sign in and sign up with Google, next to the phone code. A Google member's account is the Supabase user Google creates; Echo keeps the
-- email Google verified in place of a phone number. The phone column becomes optional with supabase/google_signin_setup.sql, which is
-- run by hand because it contains "drop"; until then Google sign-up is refused with a plain message.

create or replace function private.phone_optional() returns boolean
language sql stable set search_path = ''
as $$ select coalesce((select c.is_nullable = 'YES' from information_schema.columns c where c.table_schema = 'private' and c.table_name = 'identities' and c.column_name = 'phone'), false) $$;

create or replace function public.register_member(
  p_full_name text, p_date_of_birth date, p_email text,
  p_pen_name text, p_avatar public.avatar_kind, p_languages text[], p_topics text[], p_consent_version text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  v_phone text;
  v_email text;
  v_age int;
  v_band public.age_band;
  v_name text := btrim(p_pen_name);
  v_full text := btrim(p_full_name);
  v_problem jsonb;
begin
  if exists (select 1 from public.accounts a where a.account_id = uid) then
    return private.fail('already-registered', 'You already have an account.');
  end if;
  select u.phone, case when u.email_confirmed_at is not null then u.email end into v_phone, v_email from auth.users u where u.id = uid;
  if v_phone is null and v_email is null then return private.fail('phone', 'Verify your phone number first.'); end if;
  if v_phone is null and not private.phone_optional() then return private.fail('setup', 'Signing up with Google isn’t switched on yet. Use your phone number for now.'); end if;
  if v_phone is not null then
    v_phone := case when left(v_phone, 1) = '+' then v_phone else '+' || v_phone end;
    if v_phone !~ '^\+254[17][0-9]{8}$' then return private.fail('phone', 'Enter a Kenyan mobile number, like 0712 345 678.'); end if;
  end if;
  if char_length(v_full) < 2 then return private.fail('name', 'Enter your full name.'); end if;
  if p_date_of_birth is null or p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01' then
    return private.fail('dob', 'Enter your date of birth as day / month / year.');
  end if;
  v_age := private.age_on(p_date_of_birth, current_date);
  v_band := private.band_for(v_age);
  if v_band is null then return private.fail('under-18', 'Echo is for people 18 and over.'); end if;
  if p_email is not null and btrim(p_email) <> '' and btrim(p_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return private.fail('email', 'That email doesn’t look right. You can leave it blank.');
  end if;
  v_problem := private.pen_name_problem(v_name, v_full);
  if v_problem is not null then return v_problem; end if;
  if exists (select 1 from public.profiles p where p.pen_name_key = lower(v_name)) then
    return private.fail('taken', 'Someone already has that name. Try another.');
  end if;
  if p_languages is null or cardinality(p_languages) = 0 or not (p_languages <@ private.allowed_languages()) then
    return private.fail('languages', 'Choose at least one language.');
  end if;
  if p_topics is not null and not (p_topics <@ private.allowed_topics()) then
    return private.fail('topics', 'Choose topics from the list.');
  end if;
  if p_consent_version is null or btrim(p_consent_version) = '' then return private.fail('consent', 'Please accept the terms to continue.'); end if;

  insert into private.identities (account_id, full_name, phone, email, date_of_birth)
    values (uid, v_full, v_phone, coalesce(nullif(btrim(p_email), ''), v_email), p_date_of_birth);
  insert into public.accounts (account_id) values (uid);
  insert into public.profiles (account_id, pen_name, avatar, languages, topics, age_band)
    values (uid, v_name, p_avatar, p_languages, coalesce(p_topics, '{}'), v_band);
  insert into public.consents (account_id, version, terms, privacy, guidelines, moderation)
    values (uid, p_consent_version, true, true, true, true);
  return jsonb_build_object('ok', true, 'age_band', v_band);
exception when unique_violation then
  return private.fail('taken', 'Someone already has that name. Try another.');
end;
$$;

-- The account also says whether it signs in with Google, so the app knows how to ask for a fresh check.
create or replace function public.my_account() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return (
    select jsonb_build_object(
      'id', a.account_id,
      'standing', a.standing,
      'has_posted_before', a.has_posted_before,
      'deletion_requested_at', a.deletion_requested_at,
      'trusted_device', a.trusted_device,
      'shared_device', a.shared_device,
      'mood', case when a.mood_value is null then null else jsonb_build_object('value', a.mood_value, 'at', a.mood_at) end,
      'settings', private.default_settings() || a.settings,
      'created_at', a.created_at,
      'has_google', exists (select 1 from auth.identities ai where ai.user_id = uid and ai.provider = 'google'),
      'public', jsonb_build_object(
        'pen_name', p.pen_name, 'avatar', p.avatar, 'languages', p.languages, 'topics', p.topics,
        'age_band', p.age_band, 'open_to_chats', p.open_to_chats, 'pen_name_changed_at', p.pen_name_changed_at),
      'private', jsonb_build_object(
        'full_name', i.full_name, 'phone', i.phone, 'email', coalesce(i.email, ''), 'date_of_birth', i.date_of_birth, 'id_verified', i.id_verified),
      'consents', (select jsonb_build_object('version', c.version, 'terms', c.terms, 'privacy', c.privacy, 'guidelines', c.guidelines, 'moderation', c.moderation, 'at', c.accepted_at)
                   from public.consents c where c.account_id = uid order by c.accepted_at desc limit 1),
      'devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'approx_place', d.approx_place, 'last_active_at', d.last_active_at) order by d.last_active_at desc)
                           from public.devices d where d.account_id = uid and d.revoked_at is null), '[]'::jsonb)
    )
    from public.accounts a
    join public.profiles p on p.account_id = a.account_id
    join private.identities i on i.account_id = a.account_id
    where a.account_id = uid
  );
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.register_member(text, date, text, text, public.avatar_kind, text[], text[], text), public.my_account() from public, anon;
grant execute on function public.register_member(text, date, text, text, public.avatar_kind, text[], text[], text), public.my_account() to authenticated;
