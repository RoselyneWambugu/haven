-- Analytics from real use. Counts and rates only: no message text and no identities.
-- Chats are deleted after a day, so events are counted when they happen, in private.daily, and the counts outlive the chats.
-- Not tracked yet: installs and directory views (the server never sees them), so those stay at zero.

create table if not exists private.daily (
  day date not null,
  key text not null,
  n int not null default 0,
  primary key (day, key)
);
-- Which members were active on which day (they sent a message, booked or attended a session). Used for retention and the breakdown.
create table if not exists private.activity (
  day date not null,
  account_id uuid not null references auth.users (id) on delete cascade,
  primary key (day, account_id)
);
alter table private.daily enable row level security;
alter table private.activity enable row level security;

create or replace function private.today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Africa/Nairobi')::date $$;

create or replace function private.bump(p_key text, p_day date default null) returns void
language sql set search_path = ''
as $$
  insert into private.daily (day, key, n) values (coalesce(p_day, private.today()), p_key, 1)
  on conflict (day, key) do update set n = private.daily.n + 1
$$;

create or replace function private.mark_active(p_account uuid) returns void
language sql set search_path = ''
as $$
  insert into private.activity (day, account_id) select private.today(), p_account where p_account is not null on conflict do nothing
$$;

create or replace function private.track_account() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.bump('registered'); return new; end; $$;
create or replace function private.track_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.bump('profiled'); return new; end; $$;
create or replace function private.track_identity() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id_verified and (tg_op = 'INSERT' or not old.id_verified) then perform private.bump('verified'); end if;
  return new;
end; $$;
create or replace function private.track_conversation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump('conversations');
  if new.kind = 'peer' then perform private.bump('matched'); end if;
  return new;
end; $$;
create or replace function private.track_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid;
begin
  if new.kind <> 'text' then return new; end if;
  select m.account_id into who from public.conversation_members m where m.id = new.sender_member;
  perform private.mark_active(who);
  if not exists (select 1 from public.messages x where x.conversation_id = new.conversation_id and x.kind = 'text' and x.id <> new.id) then perform private.bump('firstMessage'); end if;
  return new;
end; $$;
create or replace function private.track_order() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') and coalesce(new.kind, 'plan') = 'plan' then
    if exists (select 1 from private.orders o where o.account_id = new.account_id and o.status = 'paid' and coalesce(o.kind, 'plan') = 'plan' and o.id <> new.id) then perform private.bump('renewals');
    else perform private.bump('subscribed'); end if;
  end if;
  return new;
end; $$;
create or replace function private.track_subscription() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.cancelled_at is not null and old.cancelled_at is null then perform private.bump('churned'); end if;
  return new;
end; $$;
create or replace function private.track_session() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then perform private.bump('bookings'); perform private.mark_active(new.member_id);
  else
    if new.status = 'completed' and old.status is distinct from 'completed' then perform private.bump('sessions'); perform private.mark_active(new.member_id); end if;
    if new.rating_stars is not null and old.rating_stars is null then perform private.bump('ratings'); end if;
  end if;
  return new;
end; $$;
create or replace function private.track_report() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.bump('reports'); return new; end; $$;
create or replace function private.track_block() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.bump('blocks'); return new; end; $$;

do $$
declare t record;
begin
  for t in select * from (values
    ('echo_t_account', 'public.accounts', 'after insert', 'private.track_account'),
    ('echo_t_profile', 'public.profiles', 'after insert', 'private.track_profile'),
    ('echo_t_identity', 'private.identities', 'after insert or update of id_verified', 'private.track_identity'),
    ('echo_t_conversation', 'public.conversations', 'after insert', 'private.track_conversation'),
    ('echo_t_message', 'public.messages', 'after insert', 'private.track_message'),
    ('echo_t_order', 'private.orders', 'after insert or update of status', 'private.track_order'),
    ('echo_t_subscription', 'private.subscriptions', 'after update of cancelled_at', 'private.track_subscription'),
    ('echo_t_session', 'private.sessions', 'after insert or update of status, rating_stars', 'private.track_session'),
    ('echo_t_report', 'private.reports', 'after insert', 'private.track_report'),
    ('echo_t_block', 'private.blocks', 'after insert', 'private.track_block')
  ) as v(name, tbl, ev, fn)
  loop
    if not exists (select 1 from pg_trigger where tgname = t.name) then
      execute format('create trigger %I %s on %s for each row execute function %s()', t.name, t.ev, t.tbl, t.fn);
    end if;
  end loop;
end;
$$;

-- Fill in what already happened, for the things that still exist.
insert into private.daily (day, key, n)
select d, k, count(*) from (
  select (created_at at time zone 'Africa/Nairobi')::date d, 'registered' k from public.accounts
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'profiled' from public.profiles
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'verified' from private.identities where id_verified
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'conversations' from public.conversations
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'matched' from public.conversations where kind = 'peer'
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'bookings' from private.sessions
  union all select (start_at at time zone 'Africa/Nairobi')::date, 'sessions' from private.sessions where status = 'completed'
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'ratings' from private.sessions where rating_stars is not null
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'reports' from private.reports
  union all select (created_at at time zone 'Africa/Nairobi')::date, 'blocks' from private.blocks
) x group by d, k
on conflict (day, key) do nothing;

-- Everything the Analytics module draws, in one reply. Small cells are hidden here, on the server.
create or replace function public.admin_analytics() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  today date := private.today();
  keys text[] := array['installs','registered','verified','profiled','matched','firstMessage','subscribed','active','dirViews','bookings','sessions','ratings','conversations','reports','blocks','renewals','churned','refunds'];
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true,
    'days', (
      select jsonb_agg(
        (select jsonb_object_agg(k, case k
            when 'active' then (select count(*) from private.activity a where a.day = g.d)
            else coalesce((select dl.n from private.daily dl where dl.day = g.d and dl.key = k), 0) end)
         from unnest(keys) k) || jsonb_build_object('t', private.week_ms(g.d))
        order by g.d)
      from (select today - 179 + i as d from generate_series(0, 179) i) g),
    'cohorts', (
      select coalesce(jsonb_agg(jsonb_build_object('label', to_char(c.wk, 'MM-DD'), 'size', c.size,
          'd1', case when c.size >= 10 and c.age >= 1 then c.r1 end, 'd7', case when c.size >= 10 and c.age >= 14 then c.r7 end, 'd30', case when c.size >= 10 and c.age >= 37 then c.r30 end) order by c.wk), '[]'::jsonb)
      from (
        select w.wk, (today - w.wk) as age,
          (select count(*) from public.accounts a where (a.created_at at time zone 'Africa/Nairobi')::date >= w.wk and (a.created_at at time zone 'Africa/Nairobi')::date < w.wk + 7) as size,
          coalesce((select count(*) filter (where exists (select 1 from private.activity y where y.account_id = a.account_id and y.day = (a.created_at at time zone 'Africa/Nairobi')::date + 1))::numeric / nullif(count(*), 0)
                    from public.accounts a where (a.created_at at time zone 'Africa/Nairobi')::date >= w.wk and (a.created_at at time zone 'Africa/Nairobi')::date < w.wk + 7), 0) as r1,
          coalesce((select count(*) filter (where exists (select 1 from private.activity y where y.account_id = a.account_id and y.day = (a.created_at at time zone 'Africa/Nairobi')::date + 7))::numeric / nullif(count(*), 0)
                    from public.accounts a where (a.created_at at time zone 'Africa/Nairobi')::date >= w.wk and (a.created_at at time zone 'Africa/Nairobi')::date < w.wk + 7), 0) as r7,
          coalesce((select count(*) filter (where exists (select 1 from private.activity y where y.account_id = a.account_id and y.day = (a.created_at at time zone 'Africa/Nairobi')::date + 30))::numeric / nullif(count(*), 0)
                    from public.accounts a where (a.created_at at time zone 'Africa/Nairobi')::date >= w.wk and (a.created_at at time zone 'Africa/Nairobi')::date < w.wk + 7), 0) as r30
        from (select (private.week_start(now()) - 7 * i) as wk from generate_series(1, 8) i) w) c),
    'who', jsonb_build_object(
      'rows', jsonb_build_array('18–24', '25–34', '35–44', '45–54', '55+'),
      'cols', jsonb_build_array('English', 'Kiswahili', 'Sheng', 'Kikuyu', 'Dholuo'),
      'cells', (
        select jsonb_agg(row_cells order by ord) from (
          select b.ord, (select jsonb_agg(case when n >= 10 then n end order by lo.ord2) from (
              select l.ord2, (select count(*) from public.profiles p
                               where p.age_band::text = b.band and l.lang = any (p.languages)
                                 and exists (select 1 from private.activity y where y.account_id = p.account_id and y.day > today - 30)) as n
              from unnest(array['English','Kiswahili','Sheng','Kikuyu','Dholuo']) with ordinality as l(lang, ord2)) lo) as row_cells
          from unnest(array['18-24','25-34','35-44','45-54','55+']) with ordinality as b(band, ord)) q)),
    'reviewMinutes', coalesce((
      select jsonb_agg(greatest(0, round(extract(epoch from (au.at - r.created_at)) / 60)::int))
      from private.reports r
      join lateral (select min(x.at) as at from private.audit x where x.action = 'Took case' and x.target = 'C-r:' || r.id) au on au.at is not null
      where private.severity_of(r.reason) = 'S1' and r.created_at > now() - interval '90 days'), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_analytics() from public, anon;
grant execute on function public.admin_analytics() to authenticated;
