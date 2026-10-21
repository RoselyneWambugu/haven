-- Echo backend, slice 5: the therapist directory, booking, sessions and therapist chats (the member's side).
-- Safe to run more than once. No therapist signs in yet: the therapists below are sample records with no account
-- (is_demo), and nobody answers a therapist chat until the therapist portal is built on the server.

alter table private.reports add column if not exists queue text;
alter table private.reports add column if not exists therapist_id text;
alter table private.reports add column if not exists session_id uuid;
alter table public.conversations add column if not exists therapist_id text;

create table if not exists private.therapists (
  id text primary key,
  account_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  title text not null,
  tone text not null check (tone in ('a', 'b', 'c', 'd')),
  gender text not null check (gender in ('woman', 'man')),
  bio text not null,
  specialisations text[] not null default '{}',
  languages text[] not null default '{}',
  modes text[] not null check (modes <@ array['chat', 'voice', 'video']),
  price_kes int,
  licence_body text not null,
  licence_number text not null,
  licence_valid_to date not null,
  accepting_new boolean not null default true,
  suspended boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists private.therapist_availability (
  id bigint generated always as identity primary key,
  therapist_id text not null references private.therapists (id) on delete cascade,
  dow int not null check (dow between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  modes text[] not null
);

create table if not exists private.sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users (id) on delete cascade,
  therapist_id text not null references private.therapists (id),
  mode text not null check (mode in ('chat', 'voice', 'video')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled', 'missed')),
  price_kes int,
  receipt_no text,
  order_id uuid,
  rating_stars int check (rating_stars between 1 and 5),
  rating_comment text,
  follow_up_offer timestamptz,
  late_charge boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sessions_therapist_idx on private.sessions (therapist_id, start_at) where status = 'booked';
create index if not exists sessions_member_idx on private.sessions (member_id, start_at);

alter table private.orders alter column plan_id drop not null;
alter table private.orders add column if not exists kind text not null default 'plan';
alter table private.orders add column if not exists therapist_id text;
alter table private.orders add column if not exists mode text;
alter table private.orders add column if not exists start_at timestamptz;
alter table private.orders add column if not exists session_id uuid;

alter table private.therapists enable row level security;
alter table private.therapist_availability enable row level security;
alter table private.sessions enable row level security;

insert into private.therapists (id, name, title, tone, gender, bio, specialisations, languages, modes, price_kes, licence_body, licence_number, licence_valid_to, accepting_new, is_demo) values
  ('t-amina', 'Dr. Amina Otieno', 'Clinical psychologist', 'a', 'woman', 'I help people feel heard and build practical coping skills for anxiety and loss.', array['Anxiety','Grief','Relationships'], array['English','Kiswahili'], array['chat','voice','video'], 1500, 'Counsellors and Psychologists Board', '1234', date '2027-03-31', true, true),
  ('t-james', 'James Mwangi', 'Counsellor', 'b', 'man', 'A calm space to talk through work pressure and relationship difficulties.', array['Relationships','Work stress'], array['English'], array['chat','voice'], 1200, 'Counsellors and Psychologists Board', '2210', date '2027-06-30', true, true),
  ('t-grace', 'Dr. Grace Wanjiru', 'Psychiatrist', 'c', 'woman', 'I support people living with depression and anxiety, including medication questions.', array['Depression','Anxiety','Trauma'], array['English','Kikuyu'], array['chat','voice','video'], 2500, 'Kenya Medical Practitioners and Dentists Council', 'A-5521', date '2027-01-31', false, true),
  ('t-peter', 'Peter Ochieng', 'Counsellor', 'd', 'man', 'I walk with people through grief and family change, at your pace.', array['Grief','Family'], array['English','Dholuo'], array['chat','voice'], 1000, 'Counsellors and Psychologists Board', '3017', date '2026-12-03', true, true),
  ('t-faith', 'Faith Njeri', 'Counselling psychologist', 'c', 'woman', 'Trauma-informed support for relationships, identity and big life changes.', array['Trauma','Relationships','Life changes'], array['English','Kiswahili','Kikuyu'], array['chat','voice','video'], 1800, 'Counsellors and Psychologists Board', '2894', date '2027-08-31', true, true),
  ('t-hassan', 'Dr. Hassan Abdi', 'Clinical psychologist', 'b', 'man', 'Evidence-based support for depression and anxiety, in your own language.', array['Depression','Anxiety'], array['English','Kiswahili','Somali'], array['voice','video'], 2000, 'Counsellors and Psychologists Board', '1980', date '2027-04-30', true, true)
on conflict (id) do nothing;

insert into private.therapist_availability (therapist_id, dow, start_time, end_time, modes)
select v.t, v.d, v.s::time, v.e::time, v.m from (values
  ('t-amina', 1, '09:00', '12:00', array['chat','voice','video']), ('t-amina', 2, '14:00', '17:00', array['chat','voice','video']), ('t-amina', 3, '09:00', '12:00', array['chat','voice','video']),
  ('t-amina', 4, '14:00', '17:00', array['chat','voice','video']), ('t-amina', 5, '09:00', '12:00', array['chat','voice']),
  ('t-james', 1, '16:00', '19:00', array['chat','voice']), ('t-james', 2, '09:00', '12:00', array['chat','voice']), ('t-james', 4, '16:00', '19:00', array['chat','voice']), ('t-james', 6, '10:00', '13:00', array['chat','voice']),
  ('t-grace', 3, '14:00', '18:00', array['chat','voice','video']), ('t-grace', 5, '14:00', '18:00', array['chat','voice','video']),
  ('t-peter', 1, '10:00', '13:00', array['chat','voice']), ('t-peter', 3, '15:00', '18:00', array['chat','voice']), ('t-peter', 5, '10:00', '13:00', array['chat','voice']),
  ('t-faith', 2, '10:00', '13:00', array['chat','voice','video']), ('t-faith', 4, '10:00', '13:00', array['chat','voice','video']), ('t-faith', 6, '09:00', '12:00', array['chat','voice','video']),
  ('t-hassan', 1, '14:00', '18:00', array['voice','video']), ('t-hassan', 3, '09:00', '12:00', array['voice','video']), ('t-hassan', 4, '09:00', '12:00', array['voice','video'])
) as v(t, d, s, e, m)
where not exists (select 1 from private.therapist_availability a where a.therapist_id = v.t);

select 'therapist tables ready' as status, (select count(*) from private.therapists) as therapists;

-- ------------------------------------------------------------------ rules in one place

-- Whether a session could start at this time: inside the therapist's weekly hours, in a mode they offer, not too soon,
-- within two weeks, and clear of their other sessions. A therapist who is on now can also take a session that starts within the hour.
create or replace function private.slot_ok(p_therapist text, p_mode text, p_start timestamptz, p_exclude uuid default null, p_for_new boolean default true) returns boolean
language plpgsql stable set search_path = ''
as $$
declare
  t private.therapists;
  loc timestamp;
  tod time;
  b record;
  quarter timestamptz := to_timestamp(ceil(extract(epoch from now()) / 900) * 900);
  block_start timestamptz;
begin
  select * into t from private.therapists where id = p_therapist;
  if not found or t.suspended then return false; end if;
  if p_for_new and not t.accepting_new then return false; end if;
  if not (p_mode = any (t.modes)) then return false; end if;
  if p_start <= now() - interval '1 minute' or p_start > now() + interval '14 days' then return false; end if;
  if exists (select 1 from private.sessions s where s.therapist_id = p_therapist and s.status = 'booked' and (p_exclude is null or s.id <> p_exclude)
             and abs(extract(epoch from (s.start_at - p_start))) < 45 * 60) then return false; end if;
  loc := p_start at time zone 'Africa/Nairobi';
  tod := loc::time;
  for b in select * from private.therapist_availability a
           where a.therapist_id = p_therapist and a.dow = extract(dow from loc)::int and p_mode = any (a.modes)
             and tod >= a.start_time and tod + interval '45 minutes' <= a.end_time
  loop
    if p_start >= now() + interval '2 hours' and (extract(epoch from (tod - b.start_time)) / 60)::int % 60 = 0 then return true; end if;
    block_start := (loc::date + b.start_time) at time zone 'Africa/Nairobi';
    if p_start <= now() + interval '60 minutes' and abs(extract(epoch from (p_start - greatest(quarter, block_start)))) < 900 and (extract(epoch from p_start))::bigint % 900 = 0 then return true; end if;
  end loop;
  return false;
end;
$$;

-- The therapist a member is working with now: one with a booked session still to come, or a therapist chat that hasn't ended.
create or replace function private.current_therapist(p_account uuid) returns text
language plpgsql stable set search_path = ''
as $$
declare t text;
begin
  select s.therapist_id into t from private.sessions s where s.member_id = p_account and s.status = 'booked' and s.end_at > now() order by s.start_at limit 1;
  if t is not null then return t; end if;
  select c.therapist_id into t from public.conversations c join public.conversation_members m on m.conversation_id = c.id
    where m.account_id = p_account and not m.hidden and c.kind = 'therapist' and c.ended_at is null and c.expires_at > now() limit 1;
  return t;
end;
$$;

-- A therapist chat lasts a week from the start, or until a day after the latest booked or finished session, whichever is later.
create or replace function private.refresh_chat_expiry(p_member uuid, p_therapist text) returns void
language sql set search_path = ''
as $$
  update public.conversations c set expires_at = greatest(
      c.created_at + interval '7 days',
      coalesce((select max(s.end_at) + interval '24 hours' from private.sessions s where s.member_id = p_member and s.therapist_id = p_therapist and s.status in ('booked', 'completed')), c.created_at))
  where c.kind = 'therapist' and c.therapist_id = p_therapist and c.ended_at is null
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.account_id = p_member)
$$;

create or replace function private.warn_therapist_chats() returns void
language sql set search_path = ''
as $$
  with w as (
    update public.conversations c set warned_at = now()
    where c.kind = 'therapist' and c.warned_at is null and c.ended_at is null and c.expires_at > now() and c.expires_at - interval '24 hours' <= now()
    returning c.id)
  insert into public.messages (conversation_id, kind, body) select id, 'system', 'This chat ends in about a day and will then be deleted.' from w
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'echo-warn-therapist-chats';
select cron.schedule('echo-warn-therapist-chats', '*/5 * * * *', 'select private.warn_therapist_chats()');

create or replace function private.ensure_therapist_chat(p_member uuid, p_therapist text, p_start timestamptz) returns uuid
language plpgsql set search_path = ''
as $$
declare
  conv uuid;
  tname text;
begin
  select c.id into conv from public.conversations c join public.conversation_members m on m.conversation_id = c.id
    where m.account_id = p_member and c.kind = 'therapist' and c.therapist_id = p_therapist and c.ended_at is null and c.expires_at > now() limit 1;
  if conv is not null then return conv; end if;
  select name into tname from private.therapists where id = p_therapist;
  insert into public.conversations (kind, therapist_id, expires_at) values ('therapist', p_therapist, now() + interval '7 days') returning id into conv;
  insert into public.conversation_members (conversation_id, account_id) values (conv, p_member);
  perform private.say(conv, 'Session booked for ' || to_char(p_start at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI') || '. You can message ' || tname || ' here before then. Chats with a therapist are deleted every week, unless reported.');
  return conv;
end;
$$;

-- (The earlier private.apply_paid_order, which returned only a receipt, is no longer used.)
-- Records a paid order. A plan order gives the member their plan; a session order books the session. Returns what happened.
create or replace function private.settle_order(p_order uuid, p_method text, p_provider_ref text) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  o private.orders;
  pl private.plans;
  cur private.subscriptions;
  rcpt text := 'EC-' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  starts timestamptz;
  sid uuid;
begin
  select * into o from private.orders where id = p_order for update;
  if not found then return null; end if;
  if o.status = 'paid' then return jsonb_build_object('receipt_no', o.receipt_no, 'session_id', o.session_id); end if;
  if o.kind = 'session' then
    if not private.slot_ok(o.therapist_id, o.mode, o.start_at, null, true) then
      update private.orders set status = 'failed', failure = 'taken', method = p_method where id = p_order;
      return jsonb_build_object('failed', 'taken');
    end if;
    insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes, receipt_no, order_id)
      values (o.account_id, o.therapist_id, o.mode, o.start_at, o.start_at + interval '45 minutes', o.amount_kes, rcpt, o.id) returning id into sid;
    update private.orders set status = 'paid', method = p_method, provider_ref = p_provider_ref, receipt_no = rcpt, paid_at = now(), failure = null, session_id = sid where id = p_order;
    if o.mode = 'chat' then perform private.ensure_therapist_chat(o.account_id, o.therapist_id, o.start_at); end if;
    perform private.refresh_chat_expiry(o.account_id, o.therapist_id);
    return jsonb_build_object('receipt_no', rcpt, 'session_id', sid);
  end if;
  select * into pl from private.plans where id = o.plan_id;
  select * into cur from private.subscriptions where account_id = o.account_id;
  starts := case when cur.account_id is not null and cur.ends_at > now() then cur.ends_at else now() end;
  update private.orders set status = 'paid', method = p_method, provider_ref = p_provider_ref, receipt_no = rcpt, paid_at = now(), failure = null where id = p_order;
  insert into private.subscriptions (account_id, plan_id, started_at, ends_at, auto_renew, cancelled_at, method, receipt_no)
    values (o.account_id, o.plan_id, now(), starts + make_interval(days => pl.days), o.auto_renew, null, p_method, rcpt)
  on conflict (account_id) do update set plan_id = excluded.plan_id, started_at = excluded.started_at, ends_at = excluded.ends_at,
    auto_renew = excluded.auto_renew, cancelled_at = null, method = excluded.method, receipt_no = excluded.receipt_no;
  return jsonb_build_object('receipt_no', rcpt);
end;
$$;

create or replace function public.simulate_payment(p_order uuid, p_method text, p_outcome text default 'success') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  o private.orders;
  res jsonb;
begin
  if p_method not in ('mpesa', 'card') then return private.fail('method', 'Choose M-Pesa or card.'); end if;
  if not exists (select 1 from private.identities i join private.payment_test_phones t on t.phone = i.phone where i.account_id = uid) then
    return private.fail('unavailable', 'Payments aren’t switched on yet.');
  end if;
  select * into o from private.orders where id = p_order and account_id = uid;
  if not found or o.status <> 'pending' then return private.fail('gone', 'That checkout is no longer open.'); end if;
  if p_outcome in ('timeout', 'insufficient') then
    update private.orders set status = 'failed', failure = p_outcome, method = p_method where id = p_order;
    return jsonb_build_object('ok', false, 'code', p_outcome, 'error', case p_outcome when 'insufficient' then 'Your M-Pesa balance was too low.' else 'We didn’t get a response from M-Pesa in time.' end);
  end if;
  res := private.settle_order(p_order, p_method, 'test:' || p_order::text);
  if res ? 'failed' then return private.fail('taken', 'That time was just taken. Please pick another.'); end if;
  return jsonb_build_object('ok', true, 'receipt_no', res->>'receipt_no', 'session_id', res->'session_id');
end;
$$;

create or replace function public.confirm_payment(p_order uuid, p_provider_ref text, p_method text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare res jsonb;
begin
  if p_method not in ('mpesa', 'card') then return private.fail('method', 'Unknown method.'); end if;
  res := private.settle_order(p_order, p_method, p_provider_ref);
  if res is null then return private.fail('gone', 'No such order.'); end if;
  -- If the time was taken while the member was paying, the provider must refund this payment.
  if res ? 'failed' then return jsonb_build_object('ok', false, 'code', 'taken', 'refund', true); end if;
  return jsonb_build_object('ok', true, 'receipt_no', res->>'receipt_no', 'session_id', res->'session_id');
end;
$$;

-- ------------------------------------------------------------------ reading

create or replace function public.therapist_directory() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'therapists', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'title', t.title, 'tone', t.tone, 'gender', t.gender, 'bio', t.bio,
      'specialisations', t.specialisations, 'languages', t.languages, 'modes', t.modes, 'price_kes', t.price_kes,
      'licence_body', t.licence_body, 'licence_number', t.licence_number, 'licence_valid_to', (extract(epoch from t.licence_valid_to) * 1000)::bigint,
      'accepting_new', t.accepting_new,
      'rating_sum', coalesce((select sum(s.rating_stars) from private.sessions s where s.therapist_id = t.id and s.rating_stars is not null), 0),
      'rating_count', (select count(s.rating_stars) from private.sessions s where s.therapist_id = t.id and s.rating_stars is not null),
      'availability', coalesce((select jsonb_agg(jsonb_build_object('dow', a.dow, 'start', to_char(a.start_time, 'HH24:MI'), 'end', to_char(a.end_time, 'HH24:MI'), 'modes', a.modes) order by a.dow, a.start_time)
                                from private.therapist_availability a where a.therapist_id = t.id), '[]'::jsonb),
      'taken', coalesce((select jsonb_agg((extract(epoch from s.start_at) * 1000)::bigint order by s.start_at) from private.sessions s
                         where s.therapist_id = t.id and s.status = 'booked' and s.start_at > now() - interval '1 hour' and s.start_at < now() + interval '15 days'), '[]'::jsonb)
    ) order by t.name) from private.therapists t where not t.suspended), '[]'::jsonb));
end;
$$;

create or replace function public.my_sessions() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'sessions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'therapist_id', s.therapist_id, 'mode', s.mode, 'start_at', s.start_at, 'end_at', s.end_at, 'status', s.status,
      'price_kes', s.price_kes, 'receipt_no', s.receipt_no, 'created_at', s.created_at, 'late_charge', s.late_charge, 'follow_up_offer', s.follow_up_offer,
      'rating', case when s.rating_stars is null then null else jsonb_build_object('stars', s.rating_stars, 'comment', coalesce(s.rating_comment, '')) end
    ) order by s.start_at) from private.sessions s where s.member_id = uid), '[]'::jsonb));
end;
$$;

-- ------------------------------------------------------------------ booking and changing sessions

create or replace function public.start_session_checkout(p_therapist text, p_mode text, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  t private.therapists;
  cur text;
  oid uuid;
begin
  if not exists (select 1 from public.accounts where account_id = uid) then return private.fail('no-account', 'Sign in first.'); end if;
  select * into t from private.therapists where id = p_therapist and not suspended;
  if not found then return private.fail('therapist', 'That therapist is not available.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Booking a therapist needs an active plan.'); end if;
  cur := private.current_therapist(uid);
  if cur is not null and cur <> t.id then
    return private.fail('one-therapist', 'You can work with one therapist at a time. Finish or cancel your sessions with your current therapist first, then you can choose someone else.');
  end if;
  if not (p_mode = any (t.modes)) then return private.fail('mode', t.name || ' doesn’t offer that kind of session.'); end if;
  if not private.slot_ok(t.id, p_mode, p_start, null, true) then return private.fail('taken', 'That time was just taken. Please pick another.'); end if;
  update private.orders set status = 'cancelled' where account_id = uid and status = 'pending';
  insert into private.orders (account_id, kind, therapist_id, mode, start_at, amount_kes) values (uid, 'session', t.id, p_mode, p_start, t.price_kes) returning id into oid;
  return jsonb_build_object('ok', true, 'order_id', oid, 'amount_kes', t.price_kes, 'title', 'Session with ' || t.name);
end;
$$;

create or replace function public.cancel_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
  late boolean;
begin
  select * into s from private.sessions where id = p_id and member_id = uid and status = 'booked';
  if not found then return private.fail('gone', 'That session can’t be changed.'); end if;
  late := now() > s.start_at - interval '24 hours';
  update private.sessions set status = 'cancelled', late_charge = late where id = p_id;
  perform private.refresh_chat_expiry(uid, s.therapist_id);
  return jsonb_build_object('ok', true, 'outcome', case when late then 'late' else 'free' end);
end;
$$;

create or replace function public.reschedule_session(p_id uuid, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
  late boolean;
begin
  select * into s from private.sessions where id = p_id and member_id = uid and status = 'booked';
  if not found then return private.fail('gone', 'That session can’t be changed.'); end if;
  if not private.slot_ok(s.therapist_id, s.mode, p_start, s.id, false) then return private.fail('taken', 'That time isn’t available. Please pick another.'); end if;
  late := now() > s.start_at - interval '24 hours';
  update private.sessions set start_at = p_start, end_at = p_start + interval '45 minutes', late_charge = late where id = p_id;
  perform private.refresh_chat_expiry(uid, s.therapist_id);
  return jsonb_build_object('ok', true, 'outcome', case when late then 'late' else 'free' end);
end;
$$;

-- A session can be joined from 10 minutes before it starts until it ends. The call itself is not on the server yet.
create or replace function public.join_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
begin
  select * into s from private.sessions where id = p_id and member_id = uid and status = 'booked';
  if not found then return private.fail('gone', 'This session can’t be joined.'); end if;
  if now() < s.start_at - interval '10 minutes' or now() >= s.end_at then return private.fail('early', 'The session isn’t open yet.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.complete_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
begin
  select * into s from private.sessions where id = p_id and member_id = uid and status = 'booked';
  if not found then return private.fail('gone', 'That session can’t be changed.'); end if;
  if now() < s.start_at then return private.fail('early', 'The session hasn’t started yet.'); end if;
  update private.sessions set status = 'completed', follow_up_offer = coalesce(follow_up_offer, s.start_at + interval '7 days') where id = p_id;
  perform private.refresh_chat_expiry(uid, s.therapist_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.rate_session(p_id uuid, p_stars int, p_comment text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if p_stars is null or p_stars not between 1 and 5 then return private.fail('invalid', 'Pick between one and five stars.'); end if;
  update private.sessions set rating_stars = p_stars, rating_comment = left(coalesce(p_comment, ''), 1000)
    where id = p_id and member_id = uid and status = 'completed';
  if not found then return private.fail('gone', 'You can rate a session once it has finished.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A concern about a session goes to Clinical reviewers with what was said in the therapist chat, as it was.
create or replace function public.report_session(p_id uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
  t private.therapists;
  conv uuid;
  me public.conversation_members;
  snap jsonb;
  prior int;
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other', 'therapist-conduct', 'therapist-boundaries', 'therapist-privacy') then
    return private.fail('invalid', 'Choose a reason from the list.');
  end if;
  select * into s from private.sessions where id = p_id and member_id = uid;
  if not found then return private.fail('gone', 'That session isn’t here.'); end if;
  select * into t from private.therapists where id = s.therapist_id;
  snap := jsonb_build_array(jsonb_build_object('id', 'h0', 'who', 'reporter',
    'text', 'Session with ' || t.name || ' by ' || s.mode || ', ' || to_char(s.start_at at time zone 'Africa/Nairobi', 'Dy DD Mon, HH24:MI') || '. Calls are not recorded.'));
  if btrim(coalesce(p_note, '')) <> '' then snap := snap || jsonb_build_object('id', 'h1', 'who', 'reporter', 'text', left(btrim(p_note), 500)); end if;
  select c.id into conv from public.conversations c join public.conversation_members m on m.conversation_id = c.id
    where m.account_id = uid and c.kind = 'therapist' and c.therapist_id = s.therapist_id order by c.created_at desc limit 1;
  if conv is not null then
    select * into me from public.conversation_members where conversation_id = conv and account_id = uid;
    snap := snap || coalesce((
      select jsonb_agg(jsonb_build_object('id', 'e' || (x.rn - 1), 'who', case when x.sender_member = me.id then 'reporter' else 'reported' end,
               'text', left(x.body, 500), 'reported', (x.sender_member is distinct from me.id and x.theirs_from_end <= 3)) order by x.rn)
      from (select l.*, count(*) filter (where l.sender_member is distinct from me.id) over (order by l.rn desc rows between unbounded preceding and current row) as theirs_from_end
            from (select y.*, row_number() over (order by y.created_at) rn
                  from (select * from public.messages where conversation_id = conv and kind = 'text' order by created_at desc limit 10) y) l) x), '[]'::jsonb);
    update public.conversations set reported_at = coalesce(reported_at, now()) where id = conv;
  end if;
  select count(*)::int into prior from private.reports where therapist_id = s.therapist_id;
  insert into private.reports (reporter, reported, reported_name, target, target_id, reason, note, conversation_id, snapshot, prior_reports, queue, therapist_id, session_id)
    values (uid, t.account_id, t.name, 'session', s.id, p_reason, left(coalesce(p_note, ''), 1000), conv, snap, prior, 'clinical', s.therapist_id, s.id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------------ chats: therapist chats join the list

create or replace function public.my_chats() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  perform private.sweep();
  perform private.warn_therapist_chats();
  return jsonb_build_object(
    'ok', true,
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'member_id', me.id, 'therapist_id', c.therapist_id,
        'peer', (select jsonb_build_object('id', other.id, 'pen_name', pr.pen_name, 'avatar', pr.avatar, 'languages', pr.languages, 'age_band', pr.age_band)
                 from public.conversation_members other join public.profiles pr on pr.account_id = other.account_id
                 where other.conversation_id = c.id and other.account_id <> uid limit 1),
        'created_at', c.created_at, 'expires_at', c.expires_at, 'ended', c.ended_at is not null,
        'muted', me.muted, 'archived', me.archived,
        'disappearing', case when c.disappearing = 'proposed' then (case when c.disappearing_by = me.id then 'proposed-by-me' else 'proposed-by-them' end) else c.disappearing end,
        'unread', (select count(*) from public.messages x where x.conversation_id = c.id and x.kind = 'text' and x.sender_member is distinct from me.id and x.created_at > me.last_read_at)
                  + case when me.opened_at is null then 1 else 0 end,
        'last_at', coalesce((select max(x.created_at) from public.messages x where x.conversation_id = c.id), c.created_at),
        'messages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'from', case when x.kind = 'system' then 'system' when x.sender_member = me.id then 'me' else 'them' end, 'text', x.body, 'at', x.created_at) order by x.created_at)
                              from (select * from public.messages y where y.conversation_id = c.id order by y.created_at desc limit 300) x), '[]'::jsonb)
      ) order by c.created_at desc)
      from public.conversation_members me join public.conversations c on c.id = me.conversation_id
      where me.account_id = uid and not me.hidden and c.kind in ('peer', 'therapist')), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'pen_name', b.pen_name, 'avatar', b.avatar, 'languages', b.languages, 'age_band', b.age_band) order by b.created_at) from private.blocks b where b.blocker = uid), '[]'::jsonb),
    'match', (select private.match_reply(case when q.matched_conversation_id is not null then 'found' else 'searching' end, q.matched_conversation_id) from private.match_queue q where q.account_id = uid)
  );
end;
$$;

-- Messages: a plan is needed to write to a peer chat, but a therapist chat belongs to a booked session.
create or replace function public.send_message(p_conversation uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  m public.conversation_members;
  c public.conversations;
  a public.accounts;
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
  msg public.messages;
begin
  m := private.my_open_chat(p_conversation, uid);
  if m.id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  select * into c from public.conversations where id = p_conversation;
  if c.ended_at is not null then return private.fail('ended', 'This conversation has ended.'); end if;
  if c.expires_at <= now() then return private.fail('ended', 'This conversation has ended.'); end if;
  select * into a from public.accounts where account_id = uid;
  if a.standing = 'paused' then return private.fail('paused', 'Your account is paused.'); end if;
  if c.kind = 'peer' and not private.has_plan(uid) then return private.fail('read-only', 'Your plan has ended, so chats are read-only.'); end if;
  if t = '' then return private.fail('empty', 'Write a message first.'); end if;
  if char_length(t) > private.max_message_length() then return private.fail('too-long', 'That message is too long. Try splitting it.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  insert into public.messages (conversation_id, sender_member, body) values (p_conversation, m.id, t) returning * into msg;
  update public.conversation_members set last_read_at = msg.created_at where id = m.id;
  return jsonb_build_object('ok', true, 'message', jsonb_build_object('id', msg.id, 'from', 'me', 'text', msg.body, 'at', msg.created_at));
end;
$$;

-- Blocking and reporting a person belong to peer chats. A concern about a therapist goes through the session.
create or replace function public.block_peer(p_conversation uuid, p_also_report boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  other public.conversation_members;
  pr public.profiles;
begin
  if (private.my_open_chat(p_conversation, uid)).id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  if exists (select 1 from public.conversations where id = p_conversation and kind <> 'peer') then return private.fail('not-peer', 'This is a chat with a therapist. Report a concern from the session.'); end if;
  select * into other from public.conversation_members where conversation_id = p_conversation and account_id <> uid limit 1;
  select * into pr from public.profiles where account_id = other.account_id;
  if p_also_report then perform private.file_chat_report(uid, p_conversation, 'other', 'Blocked and reported from chat'); end if;
  insert into private.blocks (blocker, blocked, pen_name, avatar, languages, age_band) values (uid, other.account_id, pr.pen_name, pr.avatar, pr.languages, pr.age_band)
    on conflict (blocker, blocked) do nothing;
  update public.conversations set ended_at = coalesce(ended_at, now()) where id = p_conversation;
  perform private.say(p_conversation, 'This conversation has ended.');
  update public.conversation_members set hidden = true where conversation_id = p_conversation and account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.report_chat(p_conversation uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other') then
    return private.fail('invalid', 'Choose a reason from the list.');
  end if;
  if (private.my_open_chat(p_conversation, uid)).id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  if exists (select 1 from public.conversations where id = p_conversation and kind <> 'peer') then return private.fail('not-peer', 'This is a chat with a therapist. Report a concern from the session.'); end if;
  perform private.file_chat_report(uid, p_conversation, p_reason, p_note);
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'therapist_directory()', 'my_sessions()', 'start_session_checkout(text,text,timestamptz)', 'cancel_session(uuid)', 'reschedule_session(uuid,timestamptz)',
    'join_session(uuid)', 'complete_session(uuid)', 'rate_session(uuid,int,text)', 'report_session(uuid,text,text)'])
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.confirm_payment(uuid, text, text) from public, anon, authenticated;
  grant execute on function public.confirm_payment(uuid, text, text) to service_role;
end $$;
revoke all on all functions in schema private from public, anon, authenticated;

select 'therapists and sessions ready' as status, (select count(*) from private.therapists) as therapists;
