-- Automatic M-Pesa refunds, and a therapist who does not come loses stars.
--
-- Refunds: a refund made by a cancelled or missed session is queued, and an edge function (mpesa-refund) sends it back to the number that paid
-- through Safaricom's B2C service (a partial amount can be sent, which a plain reversal can't do). Safaricom answers later on the result address
-- (mpesa-refund-result). A refund that fails is tried again up to three times, then left for billing staff, who see it and can mark it sent by hand.
-- Test payments (made with the test numbers) never send real money: their refund is marked manual.
-- Stars: when a member reports that the therapist did not join, the session counts as a 1-star rating on the therapist's profile and the
-- therapist is told. The server checks that the therapist really had not joined.
-- Nothing here removes data.

-- ---------------------------------------------------------------- a plain-text patch helper (no pattern characters to escape)
create or replace function private.replace_in_function(p_sig regprocedure, p_old text, p_new text, p_marker text) returns void
language plpgsql set search_path = ''
as $$
declare
  def text := pg_get_functiondef(p_sig);
  new_def text;
begin
  if position(p_marker in def) > 0 then return; end if;
  new_def := replace(def, p_old, p_new);
  if new_def = def then raise exception 'patch did not apply to %', p_sig; end if;
  execute new_def;
end;
$$;

-- ---------------------------------------------------------------- where the money came from
alter table private.orders add column if not exists paid_phone text;

create or replace function public.payment_set_phone(p_order uuid, p_phone text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update private.orders set paid_phone = left(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 15) where id = p_order and coalesce(p_phone, '') <> '';
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- the refund queue
alter table private.refunds add column if not exists send_status text check (send_status in ('queued', 'sending', 'processing', 'sent', 'failed', 'manual'));
alter table private.refunds add column if not exists conversation_id text;
alter table private.refunds add column if not exists mpesa_receipt text;
alter table private.refunds add column if not exists attempts int not null default 0;
alter table private.refunds add column if not exists last_error text;
alter table private.refunds add column if not exists claimed_at timestamptz;
create index if not exists refunds_send_idx on private.refunds (send_status) where send_status in ('queued', 'sending', 'processing');

-- Automatic refunds start queued (a real M-Pesa payment) or manual (a test payment, or no number on record).
select private.replace_in_function('private.settle_session_money(uuid, text)'::regprocedure,
  'amount_kes, automatic)',
  'amount_kes, automatic, send_status)', 'automatic, send_status');
select private.replace_in_function('private.settle_session_money(uuid, text)'::regprocedure,
  'now(), refund, true);',
  'now(), refund, true,
      (select case when o.paid_phone is not null and coalesce(o.provider_ref, '''') not like ''test:%'' then ''queued'' else ''manual'' end from private.orders o where o.id = s.order_id));
    perform private.drain_refunds();', 'private.drain_refunds()');

create or replace function public.refund_claim(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare out jsonb;
begin
  -- A refund that was picked up but never answered (the sender stopped) goes back in the queue.
  update private.refunds set send_status = 'queued' where send_status = 'sending' and claimed_at < now() - interval '10 minutes';
  with c as (
    select r.id from private.refunds r where r.send_status = 'queued' order by r.created_at limit greatest(1, least(coalesce(p_limit, 10), 30)) for update skip locked
  ), u as (
    update private.refunds r set send_status = 'sending', attempts = r.attempts + 1, claimed_at = now() from c where r.id = c.id returning r.id, r.amount_kes, r.order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'amount', u.amount_kes, 'phone', o.paid_phone)), '[]'::jsonb) into out from u join private.orders o on o.id = u.order_id;
  return jsonb_build_object('ok', true, 'refunds', out);
end;
$$;

create or replace function public.refund_started(p_id bigint, p_conversation text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update private.refunds set send_status = 'processing', conversation_id = left(p_conversation, 120) where id = p_id and send_status = 'sending';
  return jsonb_build_object('ok', true);
end;
$$;

-- The request never reached Safaricom, or Safaricom refused it. Try again up to three times, then leave it for staff.
create or replace function public.refund_failed(p_id bigint, p_error text, p_retry boolean default true) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.refunds;
begin
  select * into r from private.refunds where id = p_id;
  if not found then return jsonb_build_object('ok', true); end if;
  update private.refunds set send_status = case when p_retry and r.attempts < 3 then 'queued' else 'failed' end, last_error = left(coalesce(p_error, ''), 300) where id = p_id;
  if not (p_retry and r.attempts < 3) then
    insert into private.payment_events (kind, reference, order_id, payload) values ('refund_failed', 'R-' || p_id, r.order_id, jsonb_build_object('error', left(coalesce(p_error, ''), 300)));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Safaricom's answer: the money reached the member's phone, or it did not.
create or replace function public.refund_result(p_conversation text, p_ok boolean, p_receipt text, p_error text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r private.refunds;
begin
  select * into r from private.refunds where conversation_id = p_conversation;
  if not found then
    insert into private.payment_events (kind, reference, order_id, payload) values ('unknown_refund_result', left(p_conversation, 120), null, jsonb_build_object('ok', p_ok));
    return jsonb_build_object('ok', true);
  end if;
  if r.send_status = 'sent' then return jsonb_build_object('ok', true); end if;
  if p_ok then
    update private.refunds set send_status = 'sent', sent_at = now(), mpesa_receipt = left(coalesce(p_receipt, ''), 40), last_error = null where id = r.id;
  else
    update private.refunds set send_status = 'failed', last_error = left(coalesce(p_error, 'Safaricom did not complete it.'), 300) where id = r.id;
    insert into private.payment_events (kind, reference, order_id, payload) values ('refund_failed', 'R-' || r.id, r.order_id, jsonb_build_object('error', left(coalesce(p_error, ''), 300)));
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Asks the sender to work through the queue. It uses the same vault token as the text sender; until a token and address are set it does nothing.
insert into private.config (key, value) values ('mpesaRefund', '{"drainUrl":"https://htsfkotheyrfyhqzeiny.supabase.co/functions/v1/mpesa-refund"}') on conflict (key) do nothing;

create or replace function private.drain_refunds() returns void
language plpgsql set search_path = ''
as $$
declare
  tok text;
  url text;
begin
  if not exists (select 1 from private.refunds where send_status in ('queued', 'sending')) then return; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'sms_drain_token' limit 1;
  select value->>'drainUrl' into url from private.config where key = 'mpesaRefund';
  if tok is null or url is null then return; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-drain-token', tok), body := '{}'::jsonb);
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'echo-refunds';
select cron.schedule('echo-refunds', '* * * * *', 'select private.drain_refunds()');

-- ---------------------------------------------------------------- Billing sees how each refund stands, and can mark one sent by hand
select private.replace_in_function('public.admin_billing()'::regprocedure,
  '''amountKes'', r.amount_kes,',
  '''amountKes'', r.amount_kes, ''sendStatus'', r.send_status, ''sendError'', r.last_error,', '''sendStatus''');

create or replace function public.admin_mark_refund_sent(p_id text, p_reference text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  r private.refunds;
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Only billing staff can do this.'); end if;
  select * into r from private.refunds where id = nullif(regexp_replace(coalesce(p_id, ''), '\D', '', 'g'), '')::bigint for update;
  if not found or r.status <> 'approved' or coalesce(r.send_status, 'manual') = 'sent' then return private.fail('gone', 'This refund can’t be marked sent.'); end if;
  update private.refunds set send_status = 'sent', sent_at = now(), mpesa_receipt = nullif(left(btrim(coalesce(p_reference, '')), 40), ''), last_error = null where id = r.id;
  perform private.staff_log(s, 'Marked refund sent', 'R-' || r.id, 'Sent by hand');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- a therapist who does not come loses stars
alter table private.sessions add column if not exists flaked boolean not null default false;

-- Each missed session counts as a 1-star rating in the therapist's average.
select private.replace_in_function('public.therapist_directory()'::regprocedure,
  'and s.rating_stars is not null), 0),',
  'and s.rating_stars is not null), 0) + (select count(*) from private.sessions f where f.therapist_id = t.id and f.flaked),', 'f.flaked');
select private.replace_in_function('public.therapist_directory()'::regprocedure,
  '''rating_count'', (select count(s.rating_stars) from private.sessions s where s.therapist_id = t.id and s.rating_stars is not null),',
  '''rating_count'', (select count(s.rating_stars) from private.sessions s where s.therapist_id = t.id and s.rating_stars is not null) + (select count(*) from private.sessions f2 where f2.therapist_id = t.id and f2.flaked),', 'f2.flaked');

select private.replace_in_function('public.my_sessions()'::regprocedure,
  '''refund_kes'', s.refund_kes,',
  '''refund_kes'', s.refund_kes, ''flaked'', s.flaked,', '''flaked''');

select private.replace_in_function('public.report_therapist_late(uuid)'::regprocedure,
  'update private.sessions set status = ''cancelled'', late_charge = false where id = p_id;',
  'update private.sessions set status = ''cancelled'', late_charge = false, flaked = true where id = p_id;
  insert into private.therapist_notes (therapist_id, title, body, href)
    values (s.therapist_id, ''A client waited and you didn’t join'', ''A session was cancelled and refunded because you hadn’t joined after '' || private.money_cfg(''therapistWaitMinutes'', 15) || '' minutes. It counts as a 1-star rating on your profile.'', ''/portal/sessions'');', 'flaked = true');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.payment_set_phone(uuid, text), public.refund_claim(int), public.refund_started(bigint, text), public.refund_failed(bigint, text, boolean),
  public.refund_result(text, boolean, text, text), public.admin_mark_refund_sent(text, text) from public, anon, authenticated;
grant execute on function public.payment_set_phone(uuid, text), public.refund_claim(int), public.refund_started(bigint, text), public.refund_failed(bigint, text, boolean),
  public.refund_result(text, boolean, text, text) to service_role;
grant execute on function public.admin_mark_refund_sent(text, text) to authenticated;

-- A member who does not come: 85% goes back and Echo keeps the rest. The therapist earns nothing from a no-show.
update private.config set value = value || '{"noShowRefundPct":85,"noShowTherapistPct":0}'::jsonb where key = 'sessionMoney';
