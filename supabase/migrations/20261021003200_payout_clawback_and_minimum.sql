-- Two gaps in payouts. (1) A session refunded after the therapist was already paid for it: the amount is taken off their next withdrawal.
-- (2) A minimum withdrawal, set by an Admin (0 means no minimum). Nothing here uses delete or drop.

create table if not exists private.payout_adjustments (
  id bigint generated always as identity primary key,
  therapist_id text not null references private.therapists (id),
  session_id uuid not null unique,
  amount_kes int not null check (amount_kes > 0),
  reason text not null default 'Session refunded after it was paid out',
  created_at timestamptz not null default now(),
  applied_payout_id bigint
);
create index if not exists payout_adjustments_idx on private.payout_adjustments (therapist_id) where applied_payout_id is null;
alter table private.payout_adjustments enable row level security;

alter table private.payouts add column if not exists adjustment_kes int not null default 0;

create or replace function private.min_payout() returns int
language sql stable set search_path = ''
as $$ select coalesce((select (value->>'minPayoutKes')::int from private.config where key = 'fees'), 0) $$;

-- The fee change functions replaced the whole 'fees' setting; they now change only the percentage.
select private.patch_function('public.admin_propose_fee(int)'::regprocedure,
  'set value = jsonb_build_object\(''platformFeePct'', p_pct\)', 'set value = value || jsonb_build_object(''platformFeePct'', p_pct)', 'value || jsonb_build_object(''platformFeePct'', p_pct)');
select private.patch_function('public.admin_decide_fee(uuid, boolean)'::regprocedure,
  'set value = jsonb_build_object\(''platformFeePct'', c\.pct\)', 'set value = value || jsonb_build_object(''platformFeePct'', c.pct)', 'value || jsonb_build_object(''platformFeePct'', c.pct)');

-- A refund on a session that was already part of a payout takes that amount off the next one.
select private.patch_function('public.admin_decide_refund(text, boolean)'::regprocedure,
  'update private\.sessions set gross_kes = null, fee_kes = null where order_id = o\.id and payout_id is null;',
  'insert into private.payout_adjustments (therapist_id, session_id, amount_kes)
        select x.therapist_id, x.id, x.gross_kes - x.fee_kes from private.sessions x where x.order_id = o.id and x.payout_id is not null and x.gross_kes is not null and x.fee_kes is not null and x.gross_kes - x.fee_kes > 0
        on conflict (session_id) do nothing;
      update private.sessions set gross_kes = null, fee_kes = null where order_id = o.id and payout_id is null;', 'payout_adjustments');

create or replace function public.admin_set_min_payout(p_kes int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the minimum withdrawal.'); end if;
  if p_kes is null or p_kes not between 0 and 100000 then return private.fail('range', 'Use 0 to 100,000 shillings. Zero means no minimum.'); end if;
  update private.config set value = value || jsonb_build_object('minPayoutKes', p_kes) where key = 'fees';
  perform private.staff_log(s, 'Changed minimum withdrawal', 'Platform fee', p_kes || ' KES');
  return jsonb_build_object('ok', true);
end;
$$;

-- The therapist's picture: what they have earned that is free to withdraw, less anything owed back, and the minimum.
create or replace function public.portal_earnings() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  av record;
  owed int;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select coalesce(sum(s.gross_kes - s.fee_kes), 0)::int as net, count(*)::int as n into av
    from private.sessions s where s.therapist_id = tid and s.gross_kes is not null and s.fee_kes is not null and s.payout_id is null and s.end_at <= now() - interval '24 hours' and s.status = 'completed';
  select coalesce(sum(a.amount_kes), 0)::int into owed from private.payout_adjustments a where a.therapist_id = tid and a.applied_payout_id is null;
  return jsonb_build_object('ok', true, 'feePct', private.platform_fee_pct(), 'minPayoutKes', private.min_payout(), 'owedBackKes', owed,
    'availableNet', greatest(av.net - owed, 0), 'availableSessions', av.n,
    'pendingNet', (select coalesce(sum(s.gross_kes - s.fee_kes), 0)::int from private.sessions s where s.therapist_id = tid and s.gross_kes is not null and s.fee_kes is not null and s.payout_id is null and s.end_at > now() - interval '24 hours' and s.status = 'completed'),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', 'P-' || p.id, 'netKes', p.net_kes, 'grossKes', p.gross_kes, 'feeKes', p.fee_kes, 'adjustmentKes', p.adjustment_kes, 'sessions', p.sessions, 'method', p.method, 'status', p.status,
                          'requestedAt', private.ms(p.requested_at), 'paidAt', case when p.paid_at is null then null else private.ms(p.paid_at) end, 'reference', p.reference) order by p.requested_at desc)
                         from (select * from private.payouts where therapist_id = tid order by requested_at desc limit 20) p), '[]'::jsonb));
end;
$$;

create or replace function public.portal_request_payout() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  th private.therapists;
  g int; f int; n int; owed int; net int; pid bigint;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into th from private.therapists where id = tid for update;
  if btrim(th.payout_method) = '' then return private.fail('method', 'Add where to send your money first.'); end if;
  select coalesce(sum(s.gross_kes), 0), coalesce(sum(s.fee_kes), 0), count(*) into g, f, n
    from private.sessions s where s.therapist_id = tid and s.gross_kes is not null and s.fee_kes is not null and s.payout_id is null and s.end_at <= now() - interval '24 hours' and s.status = 'completed';
  select coalesce(sum(a.amount_kes), 0)::int into owed from private.payout_adjustments a where a.therapist_id = tid and a.applied_payout_id is null;
  net := g - f - owed;
  if n = 0 or net <= 0 then
    return private.fail('nothing', case when owed > 0 then 'A refunded session is being taken off your earnings, so there is nothing to withdraw yet.' else 'There is nothing available to withdraw yet. Earnings clear 24 hours after a session.' end);
  end if;
  if net < private.min_payout() then return private.fail('minimum', 'The smallest withdrawal is KES ' || private.min_payout() || '. You have KES ' || net || ' available.'); end if;
  insert into private.payouts (therapist_id, gross_kes, fee_kes, adjustment_kes, net_kes, sessions, method) values (tid, g, f, owed, net, n, th.payout_method) returning id into pid;
  update private.sessions set payout_id = pid where therapist_id = tid and gross_kes is not null and fee_kes is not null and payout_id is null and end_at <= now() - interval '24 hours' and status = 'completed';
  update private.payout_adjustments set applied_payout_id = pid where therapist_id = tid and applied_payout_id is null;
  return jsonb_build_object('ok', true, 'id', 'P-' || pid, 'netKes', net);
end;
$$;

create or replace function public.admin_payouts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'payouts', coalesce((
    select jsonb_agg(jsonb_build_object('id', 'P-' || p.id, 'therapist', t.name, 'netKes', p.net_kes, 'grossKes', p.gross_kes, 'feeKes', p.fee_kes, 'adjustmentKes', p.adjustment_kes, 'sessions', p.sessions, 'method', p.method,
      'status', p.status, 'requestedAt', private.ms(p.requested_at), 'paidBy', p.paid_by, 'reference', p.reference) order by (p.status = 'requested') desc, p.requested_at desc)
    from (select * from private.payouts order by requested_at desc limit 100) p join private.therapists t on t.id = p.therapist_id), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_set_min_payout(int) from public, anon;
grant execute on function public.admin_set_min_payout(int) to authenticated;

-- The Admin's fee panel also shows the minimum.
create or replace function public.admin_fee() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'pct', private.platform_fee_pct(), 'minPayoutKes', private.min_payout(),
    'pending', (select jsonb_build_object('id', c.id, 'pct', c.pct, 'requestedBy', c.requested_name, 'mine', c.requested_by = s.account_id)
                from private.fee_changes c where c.status = 'pending' and c.created_at > now() - interval '1 day' order by c.created_at desc limit 1));
end;
$$;
