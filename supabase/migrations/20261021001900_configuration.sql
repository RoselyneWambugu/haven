-- Configuration on the server: community topics, plans and their entitlements, matching rules, feature flags and limits.
-- The server enforces what it can: topics on posts, the pen-name wait, the re-match wait, neighbouring age ranges, topic tie-breaks,
-- posting, mood check-ins, disappearing chats and video sessions. Plan changes need a second Admin. Nothing here uses delete or drop.
--
-- Not enforced yet, only stored and shown: the grace period after a plan ends, the account-deletion holding period (no deletion job
-- exists yet), and the therapy-session discount (no discount is applied to session prices yet).

create table if not exists private.config (
  key text primary key,
  value jsonb not null
);
insert into private.config (key, value) values
  ('flags', '{"forum":true,"moodCheckin":true,"disappearing":true,"therapistVideo":true}'),
  ('limits', '{"graceDays":7,"penNameChangeDays":30,"deletionHoldDays":14}'),
  ('matching', '{"neighbourFallback":true,"softTopicWeight":0,"rematchCooldownDays":30}')
on conflict (key) do nothing;

create table if not exists private.topics (
  name text primary key,
  sort int not null default 0,
  retired boolean not null default false
);
-- The topics the server already knew about become rows. Retired ones stay valid on profiles and old posts but can't be used on new posts.
insert into private.topics (name, sort)
  select t, row_number() over () from unnest(private.allowed_topics()) as t
on conflict (name) do nothing;

alter table private.plans add column if not exists ent_disappearing boolean not null default true;
alter table private.plans add column if not exists therapist_discount_pct int not null default 10 check (therapist_discount_pct between 0 and 50);

create table if not exists private.plan_changes (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
alter table private.config enable row level security;
alter table private.topics enable row level security;
alter table private.plan_changes enable row level security;

-- ---------------------------------------------------------------- readers

create or replace function private.flag(p_key text) returns boolean
language sql stable set search_path = ''
as $$ select coalesce((select (value->>p_key)::boolean from private.config where key = 'flags'), true) $$;

create or replace function private.limit_int(p_key text, p_default int) returns int
language sql stable set search_path = ''
as $$ select coalesce((select (value->>p_key)::int from private.config where key = 'limits'), p_default) $$;

create or replace function private.match_int(p_key text, p_default int) returns int
language sql stable set search_path = ''
as $$ select coalesce((select (value->>p_key)::int from private.config where key = 'matching'), p_default) $$;

create or replace function private.topic_weight() returns numeric
language sql stable set search_path = ''
as $$ select coalesce((select (value->>'softTopicWeight')::numeric from private.config where key = 'matching'), 0) $$;

create or replace function private.neighbours() returns boolean
language sql stable set search_path = ''
as $$ select coalesce((select (value->>'neighbourFallback')::boolean from private.config where key = 'matching'), true) $$;

create or replace function private.allowed_topics() returns text[]
language sql stable set search_path = ''
as $$ select coalesce(array_agg(name order by sort), '{}') from private.topics $$;

create or replace function private.postable_topics() returns text[]
language sql stable set search_path = ''
as $$ select coalesce(array_agg(name order by sort), '{}') from private.topics where not retired $$;

create or replace function private.rematch_cooldown() returns interval
language sql stable set search_path = ''
as $$ select make_interval(days => private.match_int('rematchCooldownDays', 30)) $$;

-- How many topics two members share, used only to break ties between people who already fit.
create or replace function private.topic_overlap(p_a uuid, p_b uuid) returns int
language sql stable set search_path = ''
as $$
  select count(*)::int from (
    select unnest(topics) from public.profiles where account_id = p_a
    intersect
    select unnest(topics) from public.profiles where account_id = p_b) t
$$;

create or replace function private.can_disappear() returns boolean
language sql stable set search_path = ''
as $$
  select private.flag('disappearing') and exists (
    select 1 from private.subscriptions s join private.plans p on p.id = s.plan_id
    where s.account_id = (select auth.uid()) and p.ent_disappearing)
$$;

-- ---------------------------------------------------------------- putting the settings into the rules

create or replace function private.patch_function(p_sig regprocedure, p_pattern text, p_replacement text, p_marker text) returns void
language plpgsql set search_path = ''
as $$
declare
  def text := pg_get_functiondef(p_sig);
  new_def text;
begin
  if position(p_marker in def) > 0 then return; end if;
  new_def := regexp_replace(def, p_pattern, p_replacement);
  if new_def = def then raise exception 'patch did not apply to %', p_sig; end if;
  execute new_def;
end;
$$;

select private.patch_function('public.create_post(text, text, text, text)'::regprocedure, '(\nbegin\r?\n)',
  E'\\1  if not private.flag(''forum'') then return private.fail(''off'', ''Posting is switched off for now. You can still read the community.''); end if;\n', 'private.flag(''forum'')');
select private.patch_function('public.create_post(text, text, text, text)'::regprocedure, 'private\.allowed_topics\(\)', 'private.postable_topics()', 'private.postable_topics()');
select private.patch_function('public.add_comment(uuid, text)'::regprocedure, '(\nbegin\r?\n)',
  E'\\1  if not private.flag(''forum'') then return private.fail(''off'', ''Commenting is switched off for now. You can still read the community.''); end if;\n', 'private.flag(''forum'')');
select private.patch_function('public.propose_disappearing(uuid)'::regprocedure, '(\nbegin\r?\n)',
  E'\\1  if not private.can_disappear() then return private.fail(''off'', ''Disappearing chats aren’t available on your plan right now.''); end if;\n', 'private.can_disappear()');
select private.patch_function('public.set_mood(integer)'::regprocedure, '(\nbegin\r?\n)',
  E'\\1  if not private.flag(''moodCheckin'') then return private.fail(''off'', ''The mood check-in is switched off for now.''); end if;\n', 'private.flag(''moodCheckin'')');
select private.patch_function('public.start_session_checkout(text, text, timestamp with time zone)'::regprocedure, '(\nbegin\r?\n)',
  E'\\1  if p_mode = ''video'' and not private.flag(''therapistVideo'') then return private.fail(''off'', ''Video sessions aren’t offered right now. Choose chat or voice.''); end if;\n', 'private.flag(''therapistVideo'')');
select private.patch_function('public.change_pen_name(text)'::regprocedure, 'v_days int := 30;', 'v_days int := private.limit_int(''penNameChangeDays'', 30);', 'private.limit_int(''penNameChangeDays''');
select private.patch_function('private.try_match(uuid)'::regprocedure, 'abs\(array_position\(bands, p\.age_band\) - my_idx\) <= 1',
  'abs(array_position(bands, p.age_band) - my_idx) <= (case when private.neighbours() then 1 else 0 end)', 'private.neighbours()');
select private.patch_function('private.try_match(uuid)'::regprocedure, 'order by \(p\.age_band = me\.age_band\) desc, q\.queued_at',
  'order by (p.age_band = me.age_band) desc, (case when private.topic_weight() > 0 then private.topic_overlap(p_me, q.account_id) else 0 end) desc, q.queued_at', 'private.topic_weight()');

-- ---------------------------------------------------------------- what the apps read

create or replace function private.plans_json() returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'days', p.days, 'priceKes', p.price_kes, 'enabled', p.enabled,
    'entitlements', jsonb_build_object('disappearing', p.ent_disappearing, 'therapistDiscountPct', p.therapist_discount_pct)) order by p.days), '[]'::jsonb)
  from private.plans p
$$;

create or replace function public.app_config() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true,
    'flags', (select value from private.config where key = 'flags'),
    'limits', (select value from private.config where key = 'limits'),
    'topics', coalesce((select jsonb_agg(name order by sort) from private.topics where not retired), '[]'::jsonb),
    'plans', private.plans_json());
end;
$$;

create or replace function public.admin_config() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Not allowed.'); end if;
  update private.plan_changes set status = 'expired', decided_at = now() where status = 'pending' and created_at < now() - interval '1 day';
  return jsonb_build_object('ok', true,
    'flags', (select value from private.config where key = 'flags'),
    'limits', (select value from private.config where key = 'limits'),
    'matching', (select value from private.config where key = 'matching'),
    'topics', coalesce((select jsonb_agg(name order by sort) from private.topics where not retired), '[]'::jsonb),
    'plans', private.plans_json(),
    'pendingPlans', (select jsonb_build_object('id', c.id, 'plans', c.payload, 'requestedBy', c.requested_name, 'mine', c.requested_by = s.account_id)
                     from private.plan_changes c where c.status = 'pending' order by c.created_at desc limit 1));
end;
$$;

-- ---------------------------------------------------------------- changing it (Admin only, always logged)

create or replace function public.admin_set_flag(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change feature flags.'); end if;
  if p_key not in ('forum', 'moodCheckin', 'disappearing', 'therapistVideo') or p_on is null then return private.fail('invalid', 'Choose a feature.'); end if;
  update private.config set value = jsonb_set(value, array[p_key], to_jsonb(p_on)) where key = 'flags';
  perform private.staff_log(s, case when p_on then 'Turned on feature' else 'Turned off feature' end, p_key);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_limits(p_grace int, p_pen_name int, p_deletion int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change limits.'); end if;
  if p_grace is null or p_grace not between 0 and 60 then return private.fail('invalid', 'Grace period is 0 to 60 days.'); end if;
  if p_pen_name is null or p_pen_name not between 1 and 365 then return private.fail('invalid', 'Pen-name changes are limited to once every 1 to 365 days.'); end if;
  if p_deletion is null or p_deletion not between 1 and 60 then return private.fail('invalid', 'The deletion holding period is 1 to 60 days.'); end if;
  update private.config set value = jsonb_build_object('graceDays', p_grace, 'penNameChangeDays', p_pen_name, 'deletionHoldDays', p_deletion) where key = 'limits';
  perform private.staff_log(s, 'Changed limits', 'Limits', 'grace ' || p_grace || ' d, pen name ' || p_pen_name || ' d, deletion ' || p_deletion || ' d');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_matching(p_neighbours boolean, p_weight numeric, p_cooldown int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change matching.'); end if;
  if p_weight is null or p_weight < 0 or p_weight > 1 then return private.fail('invalid', 'Topic weight is between 0 and 1.'); end if;
  if p_cooldown is null or p_cooldown < 0 or p_cooldown > 365 then return private.fail('invalid', 'The re-match wait is 0 to 365 days.'); end if;
  update private.config set value = jsonb_build_object('neighbourFallback', coalesce(p_neighbours, true), 'softTopicWeight', p_weight, 'rematchCooldownDays', p_cooldown) where key = 'matching';
  perform private.staff_log(s, 'Changed matching', 'Matching', 'topics ' || p_weight || ', wait ' || p_cooldown || ' d, neighbours ' || case when coalesce(p_neighbours, true) then 'on' else 'off' end);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_add_topic(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n text := btrim(coalesce(p_name, ''));
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change topics.'); end if;
  if char_length(n) < 2 or char_length(n) > 24 then return private.fail('invalid', 'A topic is 2 to 24 characters.'); end if;
  if n !~ '^[A-Za-z][A-Za-z ]*$' then return private.fail('invalid', 'Use letters and spaces only.'); end if;
  if exists (select 1 from private.topics where lower(name) = lower(n)) then return private.fail('invalid', 'That topic already exists.'); end if;
  insert into private.topics (name, sort) values (n, (select coalesce(max(sort), 0) + 1 from private.topics));
  perform private.staff_log(s, 'Added topic', n);
  return jsonb_build_object('ok', true);
end;
$$;

-- Renaming carries existing posts and members' chosen topics with it.
create or replace function public.admin_rename_topic(p_from text, p_to text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n text := btrim(coalesce(p_to, ''));
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change topics.'); end if;
  if not exists (select 1 from private.topics where name = p_from) then return private.fail('gone', 'That topic is gone.'); end if;
  if char_length(n) < 2 or char_length(n) > 24 then return private.fail('invalid', 'A topic is 2 to 24 characters.'); end if;
  if n !~ '^[A-Za-z][A-Za-z ]*$' then return private.fail('invalid', 'Use letters and spaces only.'); end if;
  if exists (select 1 from private.topics where lower(name) = lower(n) and name <> p_from) then return private.fail('invalid', 'That topic already exists.'); end if;
  update private.topics set name = n where name = p_from;
  update private.posts set topic = n where topic = p_from;
  update public.profiles set topics = array_replace(topics, p_from, n) where p_from = any (topics);
  perform private.staff_log(s, 'Renamed topic', p_from || ' to ' || n);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_retire_topic(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change topics.'); end if;
  if (select count(*) from private.topics where not retired) <= 3 then return private.fail('min', 'Keep at least three topics.'); end if;
  update private.topics set retired = true where name = p_name and not retired;
  if not found then return private.fail('gone', 'That topic is gone.'); end if;
  perform private.staff_log(s, 'Retired topic', p_name);
  return jsonb_build_object('ok', true);
end;
$$;

-- Plans are money, so a second Admin approves. With only one active Admin the change applies at once and the log says so.
create or replace function private.apply_plans(p_payload jsonb) returns void
language plpgsql set search_path = ''
as $$
declare p jsonb;
begin
  for p in select * from jsonb_array_elements(p_payload) loop
    update private.plans set enabled = (p->>'enabled')::boolean,
      price_kes = case when p->'priceKes' = 'null'::jsonb then null else (p->>'priceKes')::int end,
      ent_disappearing = (p->'entitlements'->>'disappearing')::boolean,
      therapist_discount_pct = (p->'entitlements'->>'therapistDiscountPct')::int
    where id = p->>'id';
  end loop;
end;
$$;

create or replace function public.admin_propose_plans(p_plans jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  p jsonb;
  cid uuid;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change plans.'); end if;
  if p_plans is null or jsonb_typeof(p_plans) <> 'array' or jsonb_array_length(p_plans) = 0 then return private.fail('invalid', 'There are no plans to change.'); end if;
  for p in select * from jsonb_array_elements(p_plans) loop
    if not exists (select 1 from private.plans where id = p->>'id') then return private.fail('invalid', 'Unknown plan.'); end if;
    if p->'priceKes' <> 'null'::jsonb and ((p->>'priceKes')::numeric <> trunc((p->>'priceKes')::numeric) or (p->>'priceKes')::numeric <= 0 or (p->>'priceKes')::numeric > 1000000) then
      return private.fail('invalid', (p->>'id') || ': a price is a whole number of shillings, up to 1,000,000. Leave it blank while it is undecided.');
    end if;
    if (p->'entitlements'->>'therapistDiscountPct')::int not between 0 and 50 then return private.fail('invalid', (p->>'id') || ': a therapy discount is 0 to 50 percent.'); end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(p_plans) x where (x->>'enabled')::boolean) then return private.fail('invalid', 'Keep at least one plan switched on.'); end if;
  update private.plan_changes set status = 'expired', decided_at = now() where status = 'pending' and created_at < now() - interval '1 day';
  if private.active_admins(s.account_id) = 0 then
    perform private.apply_plans(p_plans);
    perform private.staff_log(s, 'Changed plans without a second approver', 'Plans', 'Only one active Admin');
    return jsonb_build_object('ok', true, 'applied', true);
  end if;
  if exists (select 1 from private.plan_changes where status = 'pending') then return private.fail('pending', 'Another plan change is waiting for a second Admin. Decide or withdraw it first.'); end if;
  insert into private.plan_changes (payload, requested_by, requested_name) values (p_plans, s.account_id, s.name) returning id into cid;
  perform private.staff_log(s, 'Proposed plan change', 'Plans');
  return jsonb_build_object('ok', true, 'proposed', true, 'id', cid);
end;
$$;

create or replace function public.admin_decide_plans(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.plan_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change plans.'); end if;
  select * into c from private.plan_changes where id = p_id for update;
  if not found or c.status <> 'pending' or c.created_at < now() - interval '1 day' then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by = s.account_id then return private.fail('second-person', 'A second Admin has to decide this.'); end if;
  if p_approve then
    perform private.apply_plans(c.payload);
    update private.plan_changes set status = 'approved', decided_by = s.name, decided_at = now() where id = c.id;
    perform private.staff_log(s, 'Approved plan change', 'Plans', 'Proposed by ' || c.requested_name);
  else
    update private.plan_changes set status = 'declined', decided_by = s.name, decided_at = now() where id = c.id;
    perform private.staff_log(s, 'Declined plan change', 'Plans');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_withdraw_plans(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.plan_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change plans.'); end if;
  select * into c from private.plan_changes where id = p_id and status = 'pending' for update;
  if not found then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by <> s.account_id then return private.fail('not-yours', 'Only the person who proposed it can withdraw it. Another Admin can decline it.'); end if;
  update private.plan_changes set status = 'withdrawn', decided_by = s.name, decided_at = now() where id = c.id;
  perform private.staff_log(s, 'Withdrew plan change', 'Plans');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.app_config(), public.admin_config(), public.admin_set_flag(text, boolean), public.admin_set_limits(int, int, int),
  public.admin_set_matching(boolean, numeric, int), public.admin_add_topic(text), public.admin_rename_topic(text, text), public.admin_retire_topic(text),
  public.admin_propose_plans(jsonb), public.admin_decide_plans(uuid, boolean), public.admin_withdraw_plans(uuid) from public, anon;
grant execute on function public.app_config(), public.admin_config(), public.admin_set_flag(text, boolean), public.admin_set_limits(int, int, int),
  public.admin_set_matching(boolean, numeric, int), public.admin_add_topic(text), public.admin_rename_topic(text, text), public.admin_retire_topic(text),
  public.admin_propose_plans(jsonb), public.admin_decide_plans(uuid, boolean), public.admin_withdraw_plans(uuid) to authenticated;
