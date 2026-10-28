-- Echo backend, slice 1: accounts and privacy.
--
-- Privacy model (PRD sections on identity and privacy):
--   * What other members may see (a pen name, an avatar, an age band, languages) lives in public.profiles.
--   * What identifies a person (full name, phone, date of birth, email) lives in the `private` schema, which the API does not
--     expose at all. Only the owner can read it, and only through a function that returns their own row.
--   * Nothing is written to a table directly by the app. Every change goes through a function that checks the rules,
--     so the rules hold even if the app is modified.
--   * Every table has row-level security switched on.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.standing as enum ('good', 'restricted', 'paused');
create type public.avatar_kind as enum ('moon', 'leaf', 'wave', 'star', 'pine', 'sun', 'fern', 'drop');
create type public.age_band as enum ('18-24', '25-34', '35-44', '45-54', '55+');

-- ---------------------------------------------------------------------------
-- Reference lists the rules check against
-- ---------------------------------------------------------------------------

create function private.allowed_languages() returns text[] language sql immutable set search_path = ''
as $$ select array['English','Kiswahili','Sheng','Dholuo','Kikuyu','Kalenjin','Luhya','Kamba','Somali'] $$;

create function private.allowed_topics() returns text[] language sql immutable set search_path = ''
as $$ select array['Anxiety','Grief','Loneliness','Relationships','Family','Work stress','Life changes','Wellbeing'] $$;

create function private.reserved_names() returns text[] language sql immutable set search_path = ''
as $$ select array['admin','echo','moderator','support','therapist','official','staff','doctor','dr'] $$;

create function private.default_settings() returns jsonb language sql immutable set search_path = ''
as $$ select jsonb_build_object(
  'notifyMessages', true, 'notifySessions', true, 'notifyForum', true, 'notifyPlan', true, 'quietHours', true,
  'hideTextOnLockScreen', true, 'neutralNotifications', true, 'appLock', false, 'lockAfterSeconds', 60,
  'hidePenNameOnLock', true, 'quickExit', true, 'disappearingDefault', 'ask') $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per member. Standing and flags the rules need. Readable by its owner only.
create table public.accounts (
  account_id uuid primary key references auth.users (id) on delete cascade,
  standing public.standing not null default 'good',
  has_posted_before boolean not null default false,
  deletion_requested_at timestamptz,
  trusted_device boolean not null default true,
  shared_device boolean not null default false,
  mood_value smallint check (mood_value between 1 and 5),
  mood_at timestamptz,
  settings jsonb not null default private.default_settings(),
  created_at timestamptz not null default now()
);

-- What other members may see. Others reach it only through functions added in later slices; today it is owner-only.
create table public.profiles (
  account_id uuid primary key references auth.users (id) on delete cascade,
  pen_name text not null check (pen_name ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'),
  pen_name_key text generated always as (lower(pen_name)) stored,
  avatar public.avatar_kind not null default 'moon',
  languages text[] not null check (cardinality(languages) between 1 and 9),
  topics text[] not null default '{}',
  age_band public.age_band not null,
  open_to_chats boolean not null default true,
  pen_name_changed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_pen_name_key_unique unique (pen_name_key)
);

-- Consents are append-only: a new version adds a row, nothing is edited.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  terms boolean not null,
  privacy boolean not null,
  guidelines boolean not null,
  moderation boolean not null,
  accepted_at timestamptz not null default now()
);
create index consents_account_idx on public.consents (account_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('phone', 'web')),
  approx_place text not null default '',
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index devices_account_idx on public.devices (account_id);

-- Real identity. Not exposed by the API. The owner reads it through my_account(); staff will reach it only through
-- break-glass in a later slice.
create table private.identities (
  account_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^\+254[17][0-9]{8}$'),
  email text check (email is null or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  date_of_birth date not null,
  id_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint identities_phone_unique unique (phone)
);

-- Old pen names are kept for moderation (PRD D36).
create table private.pen_name_history (
  id bigint generated always as identity primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  pen_name text not null,
  used_from timestamptz not null,
  used_until timestamptz not null default now()
);
create index pen_name_history_account_idx on private.pen_name_history (account_id);

-- ---------------------------------------------------------------------------
-- Row-level security: owners read their own rows. Nobody writes tables directly.
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.devices enable row level security;
alter table private.identities enable row level security;
alter table private.pen_name_history enable row level security;

create policy accounts_owner_read on public.accounts for select to authenticated using (account_id = (select auth.uid()));
create policy profiles_owner_read on public.profiles for select to authenticated using (account_id = (select auth.uid()));
create policy consents_owner_read on public.consents for select to authenticated using (account_id = (select auth.uid()));
create policy devices_owner_read on public.devices for select to authenticated using (account_id = (select auth.uid()));

-- The API roles get read access to the public tables and nothing else. Writes go through functions.
revoke all on public.accounts, public.profiles, public.consents, public.devices from anon, authenticated;
grant select on public.accounts, public.profiles, public.consents, public.devices to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.fail(p_code text, p_error text) returns jsonb language sql immutable set search_path = ''
as $$ select jsonb_build_object('ok', false, 'code', p_code, 'error', p_error) $$;

create function private.age_on(p_dob date, p_on date) returns int language sql immutable set search_path = ''
as $$ select extract(year from age(p_on, p_dob))::int $$;

create function private.band_for(p_age int) returns public.age_band language sql immutable set search_path = ''
as $$ select case
  when p_age < 18 then null
  when p_age <= 24 then '18-24'::public.age_band
  when p_age <= 34 then '25-34'::public.age_band
  when p_age <= 44 then '35-44'::public.age_band
  when p_age <= 54 then '45-54'::public.age_band
  else '55+'::public.age_band end $$;

-- The pen-name rules (the same ones the app checks, so they hold even if the app is changed).
-- `p_full_name` is optional: when given, a pen name that contains a part of it is refused.
create function private.pen_name_problem(p_name text, p_full_name text default null) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v text := btrim(p_name);
  l text;
  part text;
begin
  if char_length(v) < 3 or char_length(v) > 20 then
    return private.fail('length', 'Use 3 to 20 letters or numbers.');
  end if;
  if v !~ '^[A-Za-z][A-Za-z0-9_]*$' then
    return private.fail('characters', 'Use letters and numbers only, with no spaces, like QuietPine.');
  end if;
  l := lower(v);
  if l ~ '[0-9]{7,}' or l ~ '_(com|org|net|app|io|co|ke)$' then
    return private.fail('contact', 'A pen name can’t contain contact details or links.');
  end if;
  if exists (select 1 from unnest(private.reserved_names()) r where l = r or l like r || '\_%' or l like '%\_' || r) then
    return private.fail('reserved', 'That name is reserved. Try something else.');
  end if;
  if p_full_name is not null then
    for part in select unnest(regexp_split_to_array(lower(regexp_replace(p_full_name, '[^A-Za-z ]', '', 'g')), '\s+')) loop
      if char_length(part) >= 3 and position(part in l) > 0 then
        return private.fail('real-name', 'This looks like a real name. Try something that isn’t you.');
      end if;
    end loop;
  end if;
  return null;
end;
$$;

create function private.require_member() returns uuid language plpgsql stable set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions the app calls. All security definer, all check the signed-in person, all return { ok, ... }.
-- ---------------------------------------------------------------------------

-- Whether a pen name is free and allowed. Needs a signed-in person (their code has been verified), so it cannot be used to list names.
create function public.check_pen_name(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  full_name text;
  problem jsonb;
begin
  select i.full_name into full_name from private.identities i where i.account_id = uid;
  problem := private.pen_name_problem(p_name, full_name);
  if problem is not null then return problem; end if;
  if exists (select 1 from public.profiles p where p.pen_name_key = lower(btrim(p_name)) and p.account_id <> uid) then
    return private.fail('taken', 'Someone already has that name. Try another.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Creates the member's account after their phone code is verified. Under-18s are refused and nothing is kept.
create function public.register_member(
  p_full_name text, p_date_of_birth date, p_email text,
  p_pen_name text, p_avatar public.avatar_kind, p_languages text[], p_topics text[], p_consent_version text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  v_phone text;
  v_age int;
  v_band public.age_band;
  v_name text := btrim(p_pen_name);
  v_full text := btrim(p_full_name);
  v_problem jsonb;
begin
  if exists (select 1 from public.accounts a where a.account_id = uid) then
    return private.fail('already-registered', 'You already have an account.');
  end if;
  select u.phone into v_phone from auth.users u where u.id = uid;
  if v_phone is null then return private.fail('phone', 'Verify your phone number first.'); end if;
  v_phone := case when left(v_phone, 1) = '+' then v_phone else '+' || v_phone end;
  if v_phone !~ '^\+254[17][0-9]{8}$' then return private.fail('phone', 'Enter a Kenyan mobile number, like 0712 345 678.'); end if;
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
    values (uid, v_full, v_phone, nullif(btrim(p_email), ''), p_date_of_birth);
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

-- Change a pen name. At most once every `p_min_days` days; the old name is kept for moderation.
create function public.change_pen_name(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  cur public.profiles;
  v_name text := btrim(p_name);
  v_full text;
  v_problem jsonb;
  v_days int := 30;
  v_wait int;
begin
  select * into cur from public.profiles p where p.account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  if v_name = cur.pen_name then return jsonb_build_object('ok', true); end if;
  if cur.pen_name_changed_at is not null and now() - cur.pen_name_changed_at < make_interval(days => v_days) then
    v_wait := ceil(extract(epoch from (cur.pen_name_changed_at + make_interval(days => v_days) - now())) / 86400)::int;
    return private.fail('limit', format('You can change your pen name again in %s days.', v_wait));
  end if;
  select i.full_name into v_full from private.identities i where i.account_id = uid;
  v_problem := private.pen_name_problem(v_name, v_full);
  if v_problem is not null then return v_problem; end if;
  if exists (select 1 from public.profiles p where p.pen_name_key = lower(v_name) and p.account_id <> uid) then
    return private.fail('taken', 'Someone already has that name. Try another.');
  end if;
  insert into private.pen_name_history (account_id, pen_name, used_from) values (uid, cur.pen_name, coalesce(cur.pen_name_changed_at, cur.created_at));
  update public.profiles set pen_name = v_name, pen_name_changed_at = now() where account_id = uid;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return private.fail('taken', 'Someone already has that name. Try another.');
end;
$$;

create function public.update_profile(p_avatar public.avatar_kind default null, p_languages text[] default null, p_topics text[] default null, p_open_to_chats boolean default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not exists (select 1 from public.profiles p where p.account_id = uid) then return private.fail('no-account', 'Sign in first.'); end if;
  if p_languages is not null and (cardinality(p_languages) = 0 or not (p_languages <@ private.allowed_languages())) then
    return private.fail('languages', 'Choose at least one language.');
  end if;
  if p_topics is not null and not (p_topics <@ private.allowed_topics()) then return private.fail('topics', 'Choose topics from the list.'); end if;
  update public.profiles set
    avatar = coalesce(p_avatar, avatar), languages = coalesce(p_languages, languages),
    topics = coalesce(p_topics, topics), open_to_chats = coalesce(p_open_to_chats, open_to_chats)
  where account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Settings: only known keys, with the right types. Anything else is ignored.
create function public.update_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  bools text[] := array['notifyMessages','notifySessions','notifyForum','notifyPlan','quietHours','hideTextOnLockScreen','neutralNotifications','appLock','hidePenNameOnLock','quickExit'];
  k text;
  v jsonb;
  clean jsonb := '{}'::jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then return private.fail('invalid', 'Nothing to change.'); end if;
  for k, v in select * from jsonb_each(p_patch) loop
    if k = any (bools) then
      if jsonb_typeof(v) <> 'boolean' then return private.fail('invalid', format('%s must be on or off.', k)); end if;
      clean := clean || jsonb_build_object(k, v);
    elsif k = 'lockAfterSeconds' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 0 and 86400 then return private.fail('invalid', 'That time is not allowed.'); end if;
      clean := clean || jsonb_build_object(k, v);
    elsif k = 'disappearingDefault' then
      if v #>> '{}' not in ('ask', 'on', 'off') then return private.fail('invalid', 'That choice is not allowed.'); end if;
      clean := clean || jsonb_build_object(k, v);
    end if;
  end loop;
  update public.accounts set settings = settings || clean where account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.set_mood(p_value int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if p_value is null or p_value not between 1 and 5 then return private.fail('invalid', 'Pick one of the faces.'); end if;
  update public.accounts set mood_value = p_value, mood_at = now() where account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Record this device after sign-in. `p_own` is whether it is the member's own phone (app lock on, session kept)
-- or a shared one (the session expires). Returns the device id.
create function public.trust_device(p_own boolean, p_name text, p_kind text, p_place text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  dev uuid;
begin
  if p_kind not in ('phone', 'web') then return private.fail('invalid', 'Unknown device.'); end if;
  if not exists (select 1 from public.accounts a where a.account_id = uid) then return private.fail('no-account', 'Sign in first.'); end if;
  insert into public.devices (account_id, name, kind, approx_place) values (uid, left(coalesce(nullif(btrim(p_name), ''), 'This device'), 80), p_kind, left(coalesce(p_place, ''), 80))
    returning id into dev;
  update public.accounts set
    trusted_device = p_own, shared_device = not p_own,
    settings = case when p_own then settings || jsonb_build_object('appLock', true) else settings end
  where account_id = uid;
  return jsonb_build_object('ok', true, 'device_id', dev);
end;
$$;

create function public.revoke_device(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update public.devices set revoked_at = now() where id = p_device_id and account_id = uid and revoked_at is null;
  if not found then return private.fail('not-found', 'That device isn’t here.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Account deletion: a holding period (14 days, a placeholder for decision D34), cancelled by signing in again.
create function public.request_account_deletion() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update public.accounts set deletion_requested_at = now() where account_id = uid and deletion_requested_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.cancel_account_deletion() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update public.accounts set deletion_requested_at = null where account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Everything the app needs to show the signed-in member's own account, in one call. Returns null if there is no account yet.
create function public.my_account() returns jsonb
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

-- Only signed-in members may call these. Nobody who is signed out can.
revoke all on function
  public.check_pen_name(text), public.register_member(text, date, text, text, public.avatar_kind, text[], text[], text),
  public.change_pen_name(text), public.update_profile(public.avatar_kind, text[], text[], boolean), public.update_settings(jsonb),
  public.set_mood(int), public.trust_device(boolean, text, text, text), public.revoke_device(uuid),
  public.request_account_deletion(), public.cancel_account_deletion(), public.my_account()
  from public, anon;
grant execute on function
  public.check_pen_name(text), public.register_member(text, date, text, text, public.avatar_kind, text[], text[], text),
  public.change_pen_name(text), public.update_profile(public.avatar_kind, text[], text[], boolean), public.update_settings(jsonb),
  public.set_mood(int), public.trust_device(boolean, text, text, text), public.revoke_device(uuid),
  public.request_account_deletion(), public.cancel_account_deletion(), public.my_account()
  to authenticated;

-- The private helpers are not callable from the API at all.
revoke all on all functions in schema private from public, anon, authenticated;
