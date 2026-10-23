-- SMS through Africa's Talking: sign-in codes (a Supabase Auth "Send SMS" hook, see supabase/functions/send-sms-hook), and reminders
-- (queued here, sent by supabase/functions/sms-drain). Nothing here uses delete or drop.
--
-- Reminders are short and name nobody. A member gets session reminders by SMS only if they turn "Text reminders" on in Settings.
-- A therapist gets reminders about their own sessions and licence, because they work through Echo.
-- The drain job reads a token from the vault (name sms_drain_token) that must match the SMS_DRAIN_TOKEN edge function secret; until
-- it exists, nothing is sent and the queue just waits.

create extension if not exists pg_net with schema extensions;

insert into private.config (key, value) values ('sms', '{"drainUrl":"https://htsfkotheyrfyhqzeiny.supabase.co/functions/v1/sms-drain"}') on conflict (key) do nothing;

create table if not exists private.sms_outbox (
  id bigint generated always as identity primary key,
  account_id uuid references auth.users (id) on delete set null,
  phone text not null,
  kind text not null,
  ref text not null unique,
  body text not null check (char_length(body) between 1 and 320),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists sms_outbox_queue_idx on private.sms_outbox (status, created_at) where status in ('queued', 'sending');
alter table private.sms_outbox enable row level security;

-- Members can turn text reminders on or off.
select private.patch_function('public.update_settings(jsonb)'::regprocedure,
  '''quickExit''\]',
  '''quickExit'', ''smsReminders'']', '''smsReminders''');

create or replace function private.queue_sms(p_account uuid, p_kind text, p_ref text, p_body text) returns void
language sql set search_path = ''
as $$
  insert into private.sms_outbox (account_id, phone, kind, ref, body)
  select u.id, coalesce(i.phone, u.phone), p_kind, p_ref, p_body
    from auth.users u left join private.identities i on i.account_id = u.id
   where u.id = p_account and coalesce(i.phone, u.phone) is not null
   limit 1
  on conflict (ref) do nothing
$$;

-- Looks for reminders that are due and queues them. Each has a fixed reference, so running this often never sends one twice.
create or replace function private.tick_sms() returns void
language plpgsql set search_path = ''
as $$
declare
  r record;
begin
  -- A session about an hour away: the member who opted in, and the therapist.
  for r in
    select s.id, s.member_id, t.account_id as therapist_account,
           coalesce((a.settings->>'smsReminders')::boolean, false) as member_opted_in
      from private.sessions s
      join private.therapists t on t.id = s.therapist_id
      left join public.accounts a on a.account_id = s.member_id
     where s.status = 'booked' and s.start_at > now() + interval '50 minutes' and s.start_at <= now() + interval '65 minutes'
  loop
    if r.member_opted_in then
      perform private.queue_sms(r.member_id, 'session', 'sess:' || r.id || ':member', 'Echo: your session starts in about an hour. Open the app to join.');
    end if;
    if r.therapist_account is not null then
      perform private.queue_sms(r.therapist_account, 'session', 'sess:' || r.id || ':therapist', 'Echo: you have a session in about an hour. Open the portal to join.');
    end if;
  end loop;
  -- A licence reminder, to the therapist.
  for r in
    select lr.therapist_id, lr.stage, lr.valid_to, t.account_id
      from private.licence_reminders lr join private.therapists t on t.id = lr.therapist_id
     where lr.created_at > now() - interval '2 days' and t.account_id is not null
  loop
    perform private.queue_sms(r.account_id, 'licence', 'lic:' || r.therapist_id || ':' || r.stage || ':' || r.valid_to,
      case when r.stage = 0 then 'Echo: your licence has expired and you are hidden from booking. Send your renewal from Profile.'
           else 'Echo: your licence expires in ' || r.stage || ' days or less. Send your renewal from Profile to stay listed.' end);
  end loop;
end;
$$;

-- Asks the sender to work through the queue. Needs the vault secret; otherwise it does nothing.
create or replace function private.drain_sms() returns void
language plpgsql set search_path = ''
as $$
declare
  tok text;
  url text;
begin
  if not exists (select 1 from private.sms_outbox where status = 'queued') then return; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'sms_drain_token' limit 1;
  select value->>'drainUrl' into url from private.config where key = 'sms';
  if tok is null or url is null then return; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-drain-token', tok), body := '{}'::jsonb);
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'echo-sms';
select cron.schedule('echo-sms', '*/5 * * * *', 'select private.tick_sms(); select private.drain_sms()');

-- What the sender uses: take a batch, and report each result. A message is tried three times.
create or replace function public.sms_claim(p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare msgs jsonb;
begin
  update private.sms_outbox set status = 'queued' where status = 'sending' and created_at < now() - interval '10 minutes' and attempts < 3;
  with picked as (
    select id from private.sms_outbox where status = 'queued' order by created_at limit greatest(1, least(p_limit, 50)) for update skip locked
  ), upd as (
    update private.sms_outbox o set status = 'sending', attempts = attempts + 1 from picked where o.id = picked.id returning o.id, o.phone, o.body
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'phone', phone, 'body', body)), '[]'::jsonb) into msgs from upd;
  return jsonb_build_object('ok', true, 'messages', msgs);
end;
$$;

create or replace function public.sms_result(p_id bigint, p_ok boolean, p_error text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update private.sms_outbox set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'queued' end,
    sent_at = case when p_ok then now() else sent_at end, error = case when p_ok then null else left(p_error, 200) end where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.sms_claim(int), public.sms_result(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.sms_claim(int), public.sms_result(bigint, boolean, text) to service_role;
