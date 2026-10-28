-- The member's recent payments, and where any refund request on them stands. A payment can be refunded within 14 days of paying.
create or replace function public.my_payments() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'payments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'title', case when o.kind = 'session' then 'Therapy session' else coalesce(pl.label, o.plan_id, 'Plan') || ' plan' end,
      'amountKes', o.amount_kes, 'receiptNo', o.receipt_no, 'paidAt', private.ms(o.paid_at),
      'refundable', o.refunded_at is null and o.paid_at >= now() - interval '14 days' and not exists (select 1 from private.refunds r where r.order_id = o.id and r.status in ('pending', 'approved')),
      'refund', (select jsonb_build_object('status', r.status, 'at', private.ms(coalesce(r.decided_at, r.created_at))) from private.refunds r where r.order_id = o.id order by r.created_at desc limit 1))
      order by o.paid_at desc)
    from (select * from private.orders where account_id = uid and status = 'paid' and paid_at is not null order by paid_at desc limit 20) o
    left join private.plans pl on pl.id = o.plan_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.my_payments() from public, anon;
grant execute on function public.my_payments() to authenticated;
