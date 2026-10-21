-- Refunds and the billing module. A member can ask for a refund on a paid order; billing staff and Admins approve or decline.
-- Approving ends the plan's access (or cancels the session) and is recorded. The money itself goes back by hand until a payment provider is connected.
-- Amounts are not shown in the module, because the refund policy is still an open decision (D2).

alter table private.orders add column if not exists refunded_at timestamptz;

create table if not exists private.refunds (
  id bigint generated always as identity primary key,
  order_id uuid not null references private.orders (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists refunds_one_open_idx on private.refunds (order_id) where status in ('pending', 'approved');
alter table private.refunds enable row level security;

create or replace function public.request_refund(p_order uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  o private.orders;
  why text := btrim(coalesce(p_reason, ''));
begin
  select * into o from private.orders where id = p_order and account_id = uid;
  if not found or o.status <> 'paid' then return private.fail('gone', 'We couldn’t find that payment.'); end if;
  if o.refunded_at is not null then return private.fail('refunded', 'This payment has already been refunded.'); end if;
  if char_length(why) < 5 then return private.fail('reason', 'Tell us briefly why you’re asking.'); end if;
  if o.paid_at < now() - interval '14 days' then return private.fail('late', 'Refunds can be asked for within 14 days of paying.'); end if;
  if exists (select 1 from private.refunds where order_id = o.id and status in ('pending', 'approved')) then return private.fail('open', 'You have already asked for a refund on this payment.'); end if;
  insert into private.refunds (order_id, account_id, reason) values (o.id, uid, left(why, 1000));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_billing() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true,
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object('id', 'R-' || r.id, 'penName', coalesce(p.pen_name, 'Former member'),
        'plan', case when o.kind = 'session' then 'Session' else coalesce(pl.label, o.plan_id, 'Plan') end,
        'reason', r.reason, 'status', r.status, 'decidedBy', r.decided_by) order by r.created_at desc)
      from (select * from private.refunds order by created_at desc limit 100) r
      join private.orders o on o.id = r.order_id
      left join private.plans pl on pl.id = o.plan_id
      left join public.profiles p on p.account_id = r.account_id), '[]'::jsonb),
    'unmatched', (select count(*) from private.orders o where o.status = 'paid' and coalesce(o.kind, 'plan') = 'plan' and not exists (select 1 from private.subscriptions sb where sb.account_id = o.account_id) and o.refunded_at is null),
    'failed', (select count(*) from private.orders o where o.status = 'failed' and o.created_at > now() - interval '30 days'));
end;
$$;

create or replace function public.admin_decide_refund(p_id text, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  r private.refunds;
  o private.orders;
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Only billing staff can decide refunds.'); end if;
  select * into r from private.refunds where id = nullif(regexp_replace(coalesce(p_id, ''), '\D', '', 'g'), '')::bigint for update;
  if not found or r.status <> 'pending' then return private.fail('gone', 'This refund has been decided.'); end if;
  select * into o from private.orders where id = r.order_id;
  update private.refunds set status = case when p_approve then 'approved' else 'declined' end, decided_by = s.name, decided_at = now() where id = r.id;
  if p_approve then
    update private.orders set refunded_at = now() where id = o.id;
    if coalesce(o.kind, 'plan') = 'plan' then
      update private.subscriptions set ends_at = now(), auto_renew = false, cancelled_at = coalesce(cancelled_at, now()) where account_id = o.account_id;
    elsif o.kind = 'session' then
      update private.sessions set status = 'cancelled' where order_id = o.id and status = 'booked';
    end if;
    perform private.bump('refunds');
  end if;
  perform private.staff_log(s, case when p_approve then 'Approved refund' else 'Declined refund' end, 'R-' || r.id, r.reason);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.request_refund(uuid, text), public.admin_billing(), public.admin_decide_refund(text, boolean) from public, anon;
grant execute on function public.request_refund(uuid, text), public.admin_billing(), public.admin_decide_refund(text, boolean) to authenticated;
