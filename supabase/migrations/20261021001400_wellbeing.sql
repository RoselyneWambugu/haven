-- Reviewer wellbeing on the server: the limits Admins set, breaks, the count of reveals today, the weekly heavy-queue rota,
-- handing a case on, and a quiet way to ask for support. Nothing here uses delete or drop.

create table if not exists private.wellbeing_cfg (
  id int primary key default 1 check (id = 1),
  daily_limit int not null default 20 check (daily_limit between 5 and 100),
  break_every int not null default 8 check (break_every between 2 and 50),
  break_minutes int not null default 10 check (break_minutes between 1 and 60)
);
insert into private.wellbeing_cfg (id) values (1) on conflict (id) do nothing;

create table if not exists private.staff_breaks (
  id bigint generated always as identity primary key,
  staff_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  until timestamptz not null
);
create index if not exists staff_breaks_idx on private.staff_breaks (staff_id, started_at desc);

create table if not exists private.rota (
  week_start date not null,
  staff_id uuid not null references auth.users (id) on delete cascade,
  on_rota boolean not null default true,
  primary key (week_start, staff_id)
);

alter table private.wellbeing_cfg enable row level security;
alter table private.staff_breaks enable row level security;
alter table private.rota enable row level security;

-- Weeks run Monday to Sunday in Nairobi time.
create or replace function private.week_start(p_t timestamptz) returns date
language sql immutable set search_path = ''
as $$ select date_trunc('week', p_t at time zone 'Africa/Nairobi')::date $$;

create or replace function private.week_ms(p_d date) returns bigint
language sql immutable set search_path = ''
as $$ select (extract(epoch from (p_d::timestamp at time zone 'Africa/Nairobi')) * 1000)::bigint $$;

-- Severity-1 cases: moderators on this week's rota only. If nobody has been put on the rota yet, the heavy flag on the person decides.
create or replace function public.admin_claim(p_case text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  sev text;
  cur private.case_state;
  wk date := private.week_start(now());
  allowed boolean;
begin
  if s.account_id is null or not private.staff_can(s.role, 'work') then return private.fail('role', 'Your role doesn’t work cases.'); end if;
  if not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  sev := (select c->>'severity' from jsonb_array_elements(private.cases_json(s.role)) c where c->>'id' = p_case);
  if sev = 'S1' and s.role = 'moderator' then
    if exists (select 1 from private.rota where week_start = wk and on_rota) then
      allowed := exists (select 1 from private.rota where week_start = wk and staff_id = s.account_id and on_rota);
    else
      allowed := s.heavy;
    end if;
    if not allowed then
      return private.fail('rota', 'Severity-1 and crisis cases are worked by the moderators on this week’s heavy-queue rota. Ask someone on the rota, or a clinical reviewer.');
    end if;
  end if;
  select * into cur from private.case_state where case_id = substr(p_case, 3);
  if found and cur.owner is not null and cur.owner <> s.name then return private.fail('taken', 'Someone else has taken this case.'); end if;
  insert into private.case_state (case_id, owner, status) values (substr(p_case, 3), s.name, 'in-review')
    on conflict (case_id) do update set owner = s.name, status = case when private.case_state.status = 'new' then 'in-review' else private.case_state.status end, updated_at = now();
  perform private.staff_log(s, 'Took case', p_case);
  return jsonb_build_object('ok', true);
end;
$$;

-- Revealing a flagged line: not during a break, and not past the daily limit the Admins set.
create or replace function public.admin_reveal(p_case text, p_line text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  cfg private.wellbeing_cfg;
  n int;
begin
  if s.account_id is null or not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  if exists (select 1 from private.reveals where staff_id = s.account_id and case_id = p_case and line_id = p_line) then return jsonb_build_object('ok', true); end if;
  select * into cfg from private.wellbeing_cfg where id = 1;
  if exists (select 1 from private.staff_breaks where staff_id = s.account_id and until > now()) then return private.fail('break', 'You’re on a break. Revealing opens again when it ends.'); end if;
  select count(*) into n from private.reveals where staff_id = s.account_id and at > now() - interval '1 day';
  if n >= cfg.daily_limit then return private.fail('limit', 'You’ve reached today’s limit. Take a break, and ask a colleague to continue.'); end if;
  insert into private.reveals (staff_id, case_id, line_id) values (s.account_id, p_case, p_line);
  perform private.staff_log(s, 'Revealed message', p_case || ':' || p_line);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_wellbeing() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  cfg private.wellbeing_cfg;
  last_break timestamptz;
  until_ts timestamptz;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  select * into cfg from private.wellbeing_cfg where id = 1;
  select max(started_at) into last_break from private.staff_breaks where staff_id = s.account_id;
  select max(until) into until_ts from private.staff_breaks where staff_id = s.account_id and until > now();
  return jsonb_build_object('ok', true,
    'cfg', jsonb_build_object('dailyLimit', cfg.daily_limit, 'breakEvery', cfg.break_every, 'breakMinutes', cfg.break_minutes),
    'exposure', jsonb_build_object(
      'count', (select count(*) from private.reveals where staff_id = s.account_id and at > now() - interval '1 day'),
      'sinceBreak', (select count(*) from private.reveals where staff_id = s.account_id and (last_break is null or at > last_break)),
      'breakUntil', case when until_ts is null then null else private.ms(until_ts) end),
    'rota', coalesce((
      select jsonb_agg(jsonb_build_object('weekStart', private.week_ms(w.week_start), 'heavy', w.names) order by w.week_start)
      from (select r.week_start, jsonb_agg(st.name order by st.name) as names
            from private.rota r join private.staff st on st.account_id = r.staff_id
            where r.on_rota and r.week_start >= private.week_start(now()) - 7 group by r.week_start) w), '[]'::jsonb));
end;
$$;

create or replace function public.admin_set_wellbeing(p_daily int, p_every int, p_minutes int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change wellbeing limits.'); end if;
  if p_daily is null or p_daily < 5 or p_daily > 100 then return private.fail('invalid', 'The daily limit is 5 to 100 reveals.'); end if;
  if p_every is null or p_every < 2 or p_every > 50 or p_every > p_daily then return private.fail('invalid', 'A break is suggested every 2 to 50 reveals, and no more than the daily limit.'); end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then return private.fail('invalid', 'A break is 1 to 60 minutes.'); end if;
  update private.wellbeing_cfg set daily_limit = p_daily, break_every = p_every, break_minutes = p_minutes where id = 1;
  perform private.staff_log(s, 'Changed wellbeing limits', 'Wellbeing', p_daily || ' a day, break every ' || p_every || ', ' || p_minutes || ' min');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_start_break() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  cfg private.wellbeing_cfg;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  select * into cfg from private.wellbeing_cfg where id = 1;
  insert into private.staff_breaks (staff_id, until) values (s.account_id, now() + make_interval(mins => cfg.break_minutes));
  perform private.staff_log(s, 'Started a break', 'Wellbeing');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_end_break() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  update private.staff_breaks set until = now() where staff_id = s.account_id and until > now();
  return jsonb_build_object('ok', true);
end;
$$;

-- Makes sure this week and next have a rota: moderators who were not on last week's heavy queue come first, so it rotates.
create or replace function public.admin_ensure_rota() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  wk date;
  prev date;
  size int;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  foreach wk in array array[private.week_start(now()), private.week_start(now()) + 7] loop
    if exists (select 1 from private.rota where week_start = wk) then continue; end if;
    select max(week_start) into prev from private.rota where week_start < wk and on_rota;
    select greatest(1, count(*)) into size from private.rota where week_start = prev and on_rota;
    insert into private.rota (week_start, staff_id, on_rota)
      select wk, m.account_id, true from (
        select st.account_id from private.staff st
        where st.active and st.role = 'moderator'
        order by exists (select 1 from private.rota r where r.week_start = prev and r.staff_id = st.account_id and r.on_rota), st.name
        limit size) m;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_rota(p_week bigint, p_names text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  wk date := private.week_start(to_timestamp(p_week / 1000.0));
  mods int;
  chosen uuid[];
  prev uuid[];
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change the rota.'); end if;
  if p_names is null or cardinality(p_names) = 0 then return private.fail('invalid', 'Put at least one moderator on the heavy queue.'); end if;
  select count(*) into mods from private.staff where active and role = 'moderator';
  select coalesce(array_agg(st.account_id), '{}') into chosen from private.staff st where st.active and st.role = 'moderator' and st.name = any (p_names);
  if cardinality(chosen) <> (select count(distinct n) from unnest(p_names) n) then return private.fail('invalid', 'Only active moderators can be on the heavy queue.'); end if;
  select coalesce(array_agg(r.staff_id), '{}') into prev from private.rota r where r.week_start = wk - 7 and r.on_rota;
  if cardinality(prev) > 0 and mods > cardinality(chosen) and chosen <@ prev then
    return private.fail('rotate', 'The same people can’t work the heavy queue two weeks running. Rotate at least one person.');
  end if;
  insert into private.rota (week_start, staff_id, on_rota)
    select wk, st.account_id, st.account_id = any (chosen) from private.staff st where st.active and st.role = 'moderator'
    on conflict (week_start, staff_id) do update set on_rota = excluded.on_rota;
  perform private.staff_log(s, 'Changed the heavy-queue rota', 'Wellbeing', array_to_string(p_names, ', '));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_hand_on(p_case text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  update private.case_state set owner = null, status = 'new', updated_at = now() where case_id = substr(p_case, 3) and owner = s.name and status <> 'closed';
  if not found then return private.fail('owner', 'You can only hand on a case you own.'); end if;
  perform private.staff_log(s, 'Handed a case on', p_case);
  return jsonb_build_object('ok', true);
end;
$$;

-- Logged without a reason, so no one has to explain why they asked.
create or replace function public.admin_ask_support() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  perform private.staff_log(s, 'Asked for wellbeing support', 'Wellbeing');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_wellbeing(), public.admin_set_wellbeing(int, int, int), public.admin_start_break(), public.admin_end_break(),
  public.admin_ensure_rota(), public.admin_set_rota(bigint, text[]), public.admin_hand_on(text), public.admin_ask_support() from public, anon;
grant execute on function public.admin_wellbeing(), public.admin_set_wellbeing(int, int, int), public.admin_start_break(), public.admin_end_break(),
  public.admin_ensure_rota(), public.admin_set_rota(bigint, text[]), public.admin_hand_on(text), public.admin_ask_support() to authenticated;
