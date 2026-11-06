-- Money when a paid session is cancelled or missed. The member's payment is held and shared out afterwards:
--   cancelled more than an hour before the start: everything goes back;
--   cancelled in the last hour: 10% is kept (half to the therapist, half to Echo) and 90% goes back;
--   the member does not come: 50% goes back, the therapist takes 25% and Echo 25%;
--   the therapist has not joined 15 minutes after the start: the member leaves with everything back.
-- The percentages sit in private.config (key sessionMoney) so they can be changed without a release.
-- An automatic refund is recorded as an approved refund made by "System" with its amount. Until a payment provider's reversal is connected
-- the money is sent back by billing staff to the number that paid (see Billing, Refunds).
-- A therapist's share is stored as gross_kes with no platform fee on top (fee_kes = 0), so payouts and the withdrawal hold work unchanged.
-- Nothing here removes data.

insert into private.config (key, value) values ('sessionMoney',
  '{"lateCancelMinutes":60,"lateCancelFeePct":10,"lateCancelTherapistSharePct":50,"noShowRefundPct":50,"noShowTherapistPct":25,"therapistWaitMinutes":15}')
  on conflict (key) do nothing;

alter table private.sessions add column if not exists refund_kes int;
alter table private.refunds add column if not exists amount_kes int;
alter table private.refunds add column if not exists automatic boolean not null default false;
alter table private.refunds add column if not exists sent_at timestamptz;

create or replace function private.money_cfg(p_key text, p_default int) returns int
language sql stable set search_path = ''
as $$ select coalesce((select (value ->> p_key)::int from private.config where key = 'sessionMoney'), p_default) $$;

-- Works out who gets what for a session in the given case, writes it on the session and records the refund.
create or replace function private.settle_session_money(p_session uuid, p_case text) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  s private.sessions;
  paid int;
  refund int;
  therapist int := 0;
  fee int;
  why text;
begin
  select * into s from private.sessions where id = p_session;
  if not found then return 0; end if;
  paid := coalesce(s.price_kes, 0);
  if p_case = 'late-cancel' then
    fee := round(paid * private.money_cfg('lateCancelFeePct', 10) / 100.0)::int;
    refund := paid - fee;
    therapist := round(fee * private.money_cfg('lateCancelTherapistSharePct', 50) / 100.0)::int;
    why := 'Cancelled in the last hour: ' || private.money_cfg('lateCancelFeePct', 10) || '% kept';
  elsif p_case = 'member-no-show' then
    refund := round(paid * private.money_cfg('noShowRefundPct', 50) / 100.0)::int;
    therapist := round(paid * private.money_cfg('noShowTherapistPct', 25) / 100.0)::int;
    why := 'Member did not come: part refunded';
  elsif p_case = 'therapist-no-show' then
    refund := paid;
    why := 'Therapist had not joined after ' || private.money_cfg('therapistWaitMinutes', 15) || ' minutes';
  else
    refund := paid;
    why := 'Cancelled more than an hour before';
  end if;
  update private.sessions set refund_kes = refund,
    gross_kes = case when therapist > 0 then therapist else null end,
    fee_kes = case when therapist > 0 then 0 else null end
  where id = p_session;
  if refund > 0 and s.order_id is not null
     and not exists (select 1 from private.refunds r where r.order_id = s.order_id and r.status in ('pending', 'approved')) then
    insert into private.refunds (order_id, account_id, reason, status, decided_by, decided_at, amount_kes, automatic)
    values (s.order_id, s.member_id, why, 'approved', 'System', now(), refund, true);
    update private.orders set refunded_at = now() where id = s.order_id;
  end if;
  return refund;
end;
$$;

create or replace function public.cancel_session(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
  late boolean;
  refund int;
begin
  select * into s from private.sessions where id = p_id and member_id = uid and status = 'booked';
  if not found then return private.fail('gone', 'That session can’t be changed.'); end if;
  late := now() > s.start_at - make_interval(mins => private.money_cfg('lateCancelMinutes', 60));
  update private.sessions set status = 'cancelled', late_charge = late where id = p_id;
  refund := private.settle_session_money(p_id, case when late then 'late-cancel' else 'free' end);
  perform private.refresh_chat_expiry(uid, s.therapist_id);
  return jsonb_build_object('ok', true, 'outcome', case when late then 'late' else 'free' end, 'refundKes', refund);
end;
$$;

-- Moving a session is free until the last hour; after that the member cancels instead.
select private.patch_function('public.reschedule_session(uuid, timestamptz)'::regprocedure,
  'late := now\(\) > s\.start_at - interval ''24 hours'';',
  'if now() > s.start_at - make_interval(mins => private.money_cfg(''lateCancelMinutes'', 60)) then return private.fail(''late'', ''It’s within the last hour, so it can’t be moved. You can cancel instead.''); end if;
  late := false;', 'within the last hour');

-- The therapist has not joined by 15 minutes after the start: the member may leave with everything back.
create or replace function public.report_therapist_late(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  s private.sessions;
  refund int;
begin
  select * into s from private.sessions where id = p_id and member_id = uid and status = 'booked';
  if not found then return private.fail('gone', 'That session can’t be changed.'); end if;
  if now() < s.start_at + make_interval(mins => private.money_cfg('therapistWaitMinutes', 15)) or now() >= s.end_at then
    return private.fail('early', 'Please wait ' || private.money_cfg('therapistWaitMinutes', 15) || ' minutes after the start for your therapist to join.');
  end if;
  if s.started_at is not null then return private.fail('joined', 'Your therapist has joined.'); end if;
  update private.sessions set status = 'cancelled', late_charge = false where id = p_id;
  refund := private.settle_session_money(p_id, 'therapist-no-show');
  perform private.refresh_chat_expiry(uid, s.therapist_id);
  return jsonb_build_object('ok', true, 'refundKes', refund);
end;
$$;

-- A therapist who marks the member as not coming: the money is shared 50 / 25 / 25.
select private.patch_function('public.portal_wrap_up(uuid, text, text, timestamptz)'::regprocedure,
  'perform private\.refresh_chat_expiry\(s\.member_id, tid\);',
  'if p_attendance = ''no-show'' then perform private.settle_session_money(p_id, ''member-no-show''); end if;
  perform private.refresh_chat_expiry(s.member_id, tid);', 'member-no-show');

-- The member's session list carries what went back.
select private.patch_function('public.my_sessions()'::regprocedure,
  '''late_charge'', s\.late_charge,',
  '''late_charge'', s.late_charge, ''refund_kes'', s.refund_kes,', '''refund_kes''');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.cancel_session(uuid), public.report_therapist_late(uuid) from public, anon;
grant execute on function public.cancel_session(uuid), public.report_therapist_late(uuid) to authenticated;

-- The reschedule check goes before the slot check, so a session in the last hour is told it can't be moved rather than that the time is taken.
do $mig$
declare
  def text := pg_get_functiondef('public.reschedule_session(uuid, timestamptz)'::regprocedure);
  chk text := 'if now() > s.start_at - make_interval(mins => private.money_cfg(''lateCancelMinutes'', 60)) then return private.fail(''late'', ''It’s within the last hour, so it can’t be moved. You can cancel instead.''); end if;';
  new_def text;
begin
  new_def := replace(def, '  ' || chk || E'\n', '');
  new_def := replace(new_def, E'  if not private.slot_ok(', '  ' || chk || E'\n  if not private.slot_ok(');
  if new_def = def then raise exception 'reorder did not apply'; end if;
  execute new_def;
end
$mig$;

-- Billing sees how much each automatic refund is, so it can send the right amount to the member's number.
select private.patch_function('public.admin_billing()'::regprocedure,
  '''reason'', r\.reason,',
  '''reason'', r.reason, ''amountKes'', r.amount_kes, ''automatic'', r.automatic,', '''amountKes''');
