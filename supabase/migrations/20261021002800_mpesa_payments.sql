-- M-Pesa (Daraja STK push). The edge functions mpesa-pay and mpesa-callback do the talking to Safaricom; these functions are all they and the app need.
-- The service-role-only functions can't be called by a member. A payment is only confirmed after the callback is checked against Safaricom.

alter table private.orders add column if not exists checkout_request_id text;
create unique index if not exists orders_checkout_request_idx on private.orders (checkout_request_id) where checkout_request_id is not null;

create table if not exists private.payment_events (
  id bigint generated always as identity primary key,
  kind text not null,
  reference text,
  order_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_events_ref_idx on private.payment_events (reference);
alter table private.payment_events enable row level security;

-- What the edge function needs to ask for the payment: the amount, what it is for, the payer's number, and where the order stands.
create or replace function public.payment_context(p_order uuid, p_account uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  o private.orders;
  ph text;
begin
  select * into o from private.orders where id = p_order and account_id = p_account;
  if not found then return private.fail('gone', 'That checkout is no longer open.'); end if;
  select i.phone into ph from private.identities i where i.account_id = p_account limit 1;
  return jsonb_build_object('ok', true, 'status', o.status, 'amount', o.amount_kes, 'kind', coalesce(o.kind, 'plan'), 'phone', ph, 'checkout_request_id', o.checkout_request_id);
end;
$$;

create or replace function public.payment_attach_request(p_order uuid, p_checkout_request_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update private.orders set checkout_request_id = p_checkout_request_id, method = 'mpesa' where id = p_order and status = 'pending';
  if not found then return private.fail('gone', 'That checkout is no longer open.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.payment_by_request(p_checkout_request_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare o private.orders;
begin
  select * into o from private.orders where checkout_request_id = p_checkout_request_id;
  if not found then return private.fail('gone', 'No order for that request.'); end if;
  return jsonb_build_object('ok', true, 'order_id', o.id, 'amount', o.amount_kes, 'status', o.status);
end;
$$;

create or replace function public.payment_fail(p_order uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update private.orders set status = 'failed', failure = case when p_reason in ('insufficient', 'cancelled', 'timeout') then p_reason else 'timeout' end where id = p_order and status = 'pending';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.payment_event(p_kind text, p_reference text, p_order uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.payment_events (kind, reference, order_id, payload) values (left(p_kind, 40), left(p_reference, 120), p_order, p_payload);
  return jsonb_build_object('ok', true);
end;
$$;

-- The member's screen asks this while the prompt is on their phone.
create or replace function public.order_status(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  o private.orders;
begin
  select * into o from private.orders where id = p_order and account_id = uid;
  if not found then return private.fail('gone', 'That checkout is no longer open.'); end if;
  return jsonb_build_object('ok', true, 'status', o.status, 'failure', o.failure, 'receipt_no', o.receipt_no,
    'session_id', (select s.id from private.sessions s where s.order_id = o.id limit 1));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.payment_context(uuid, uuid), public.payment_attach_request(uuid, text), public.payment_by_request(text), public.payment_fail(uuid, text),
  public.payment_event(text, text, uuid, jsonb), public.order_status(uuid) from public, anon, authenticated;
grant execute on function public.payment_context(uuid, uuid), public.payment_attach_request(uuid, text), public.payment_by_request(text), public.payment_fail(uuid, text),
  public.payment_event(text, text, uuid, jsonb) to service_role;
grant execute on function public.order_status(uuid) to authenticated;
