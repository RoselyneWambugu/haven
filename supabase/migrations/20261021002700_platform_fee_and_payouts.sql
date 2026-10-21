-- The platform fee and therapist payouts (decision D3). One percentage for every therapist, taken from each completed session's gross price
-- and fixed on the session when it is completed, so a later change never alters past earnings. A plan discount is borne by Echo: the fee is
-- worked out on the price the therapist lists, and the therapist is paid as if there were no discount. A refunded session earns no fee.
-- A change to the percentage needs a second Admin, like the strike policy. A therapist withdraws what has cleared the 24 hour hold, and
-- billing staff or an Admin mark the payout paid once they have sent the money (by hand until a payment provider is connected).
-- Nothing here uses delete or drop.

insert into private.config (key, value) values ('fees', '{"platformFeePct":15}') on conflict (key) do nothing;

create or replace function private.platform_fee_pct() returns int
language sql stable set search_path = ''
as $$ select coalesce((select (value->>'platformFeePct')::int from private.config where key = 'fees'), 15) $$;

alter table private.sessions add column if not exists fee_kes int;
alter table private.sessions add column if not exists payout_id bigint;

-- Sessions completed before this migration take the rate that was showing in the app (15%).
update private.sessions set fee_kes = round(gross_kes * 15 / 100.0)::int where gross_kes is not null and fee_kes is null;

create table if not exists private.fee_changes (
  id uuid primary key default gen_random_uuid(),
  pct int not null check (pct between 0 and 50),
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired')),
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
create table if not exists private.payouts (
  id bigint generated always as identity primary key,
  therapist_id text not null references private.therapists (id),
  gross_kes int not null,
  fee_kes int not null,
  net_kes int not null,
  sessions int not null,
  method text not null,
  status text not null default 'requested' check (status in ('requested', 'paid')),
  requested_at timestamptz not null default now(),
  paid_by text,
  paid_at timestamptz,
  reference text
);
create index if not exists payouts_therapist_idx on private.payouts (therapist_id, requested_at desc);
alter table private.fee_changes enable row level security;
alter table private.payouts enable row level security;

-- The fee is fixed on a session when it is completed.
select private.patch_function('public.portal_wrap_up(uuid, text, text, timestamptz)'::regprocedure,
  'gross_kes = case when p_attendance = ''no-show'' then null else s\.price_kes end,',
  'gross_kes = case when p_attendance = ''no-show'' then null else s.price_kes end,
    fee_kes = case when p_attendance = ''no-show'' then null else round(s.price_kes * private.platform_fee_pct() / 100.0)::int end,', 'fee_kes = case when');

-- A refunded session earns nothing, and carries no fee, unless it was already paid out.
select private.patch_function('public.admin_decide_refund(text, boolean)'::regprocedure,
  'update private\.sessions set status = ''cancelled'' where order_id = o\.id and status = ''booked'';',
  'update private.sessions set status = ''cancelled'' where order_id = o.id and status = ''booked'';
      update private.sessions set gross_kes = null, fee_kes = null where order_id = o.id and payout_id is null;', 'gross_kes = null, fee_kes = null');

-- The therapist's session list carries the fee that was fixed on each session.
select private.patch_function('public.my_portal()'::regprocedure,
  '''gross_kes'', s\.gross_kes\)',
  '''gross_kes'', s.gross_kes, ''fee_kes'', s.fee_kes)', '''fee_kes'', s.fee_kes');

-- ---------------------------------------------------------------- the fee, changed by two Admins

create or replace function public.admin_fee() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'pct', private.platform_fee_pct(),
    'pending', (select jsonb_build_object('id', c.id, 'pct', c.pct, 'requestedBy', c.requested_name, 'mine', c.requested_by = s.account_id)
                from private.fee_changes c where c.status = 'pending' and c.created_at > now() - interval '1 day' order by c.created_at desc limit 1));
end;
$$;

create or replace function public.admin_propose_fee(p_pct int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  cid uuid;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the platform fee.'); end if;
  if p_pct is null or p_pct not between 0 and 50 then return private.fail('range', 'The platform fee is 0 to 50 percent.'); end if;
  if p_pct = private.platform_fee_pct() then return private.fail('same', 'That is already the fee.'); end if;
  update private.fee_changes set status = 'expired' where status = 'pending' and created_at <= now() - interval '1 day';
  if private.active_admins(s.account_id) = 0 then
    update private.config set value = jsonb_build_object('platformFeePct', p_pct) where key = 'fees';
    perform private.staff_log(s, 'Changed platform fee without a second approver', 'Platform fee', p_pct || '%');
    return jsonb_build_object('ok', true, 'applied', true);
  end if;
  if exists (select 1 from private.fee_changes where status = 'pending') then return private.fail('pending', 'Another fee change is waiting for a second Admin. Decide or withdraw it first.'); end if;
  insert into private.fee_changes (pct, requested_by, requested_name) values (p_pct, s.account_id, s.name) returning id into cid;
  perform private.staff_log(s, 'Proposed platform fee change', 'Platform fee', p_pct || '%');
  return jsonb_build_object('ok', true, 'proposed', true, 'id', cid);
end;
$$;

create or replace function public.admin_decide_fee(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.fee_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the platform fee.'); end if;
  select * into c from private.fee_changes where id = p_id for update;
  if not found or c.status <> 'pending' or c.created_at <= now() - interval '1 day' then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by = s.account_id then return private.fail('second-person', 'A second Admin has to decide this.'); end if;
  if p_approve then
    update private.config set value = jsonb_build_object('platformFeePct', c.pct) where key = 'fees';
    update private.fee_changes set status = 'approved', decided_by = s.name, decided_at = now() where id = c.id;
    perform private.staff_log(s, 'Approved platform fee change', 'Platform fee', c.pct || '%; proposed by ' || c.requested_name);
  else
    update private.fee_changes set status = 'declined', decided_by = s.name, decided_at = now() where id = c.id;
    perform private.staff_log(s, 'Declined platform fee change', 'Platform fee');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_withdraw_fee(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.fee_changes;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin can change the platform fee.'); end if;
  select * into c from private.fee_changes where id = p_id for update;
  if not found or c.status <> 'pending' then return private.fail('gone', 'This change has already been handled or has lapsed.'); end if;
  if c.requested_by <> s.account_id then return private.fail('not-yours', 'Only the person who proposed it can withdraw it.'); end if;
  update private.fee_changes set status = 'withdrawn', decided_by = s.name, decided_at = now() where id = c.id;
  perform private.staff_log(s, 'Withdrew platform fee change', 'Platform fee');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- the therapist: earnings and withdrawing

create or replace function public.portal_earnings() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  av record;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select coalesce(sum(s.gross_kes - s.fee_kes), 0)::int as net, count(*)::int as n into av
    from private.sessions s where s.therapist_id = tid and s.gross_kes is not null and s.fee_kes is not null and s.payout_id is null and s.end_at <= now() - interval '24 hours' and s.status = 'completed';
  return jsonb_build_object('ok', true, 'feePct', private.platform_fee_pct(), 'availableNet', av.net, 'availableSessions', av.n,
    'pendingNet', (select coalesce(sum(s.gross_kes - s.fee_kes), 0)::int from private.sessions s where s.therapist_id = tid and s.gross_kes is not null and s.fee_kes is not null and s.payout_id is null and s.end_at > now() - interval '24 hours' and s.status = 'completed'),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', 'P-' || p.id, 'netKes', p.net_kes, 'grossKes', p.gross_kes, 'feeKes', p.fee_kes, 'sessions', p.sessions, 'method', p.method, 'status', p.status,
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
  g int; f int; n int; pid bigint;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into th from private.therapists where id = tid for update;
  if btrim(th.payout_method) = '' then return private.fail('method', 'Add where to send your money first.'); end if;
  select coalesce(sum(s.gross_kes), 0), coalesce(sum(s.fee_kes), 0), count(*) into g, f, n
    from private.sessions s where s.therapist_id = tid and s.gross_kes is not null and s.fee_kes is not null and s.payout_id is null and s.end_at <= now() - interval '24 hours' and s.status = 'completed';
  if n = 0 or g - f <= 0 then return private.fail('nothing', 'There is nothing available to withdraw yet. Earnings clear 24 hours after a session.'); end if;
  insert into private.payouts (therapist_id, gross_kes, fee_kes, net_kes, sessions, method) values (tid, g, f, g - f, n, th.payout_method) returning id into pid;
  update private.sessions set payout_id = pid where therapist_id = tid and gross_kes is not null and fee_kes is not null and payout_id is null and end_at <= now() - interval '24 hours' and status = 'completed';
  return jsonb_build_object('ok', true, 'id', 'P-' || pid, 'netKes', g - f);
end;
$$;

-- ---------------------------------------------------------------- staff: payouts waiting to be sent

create or replace function public.admin_payouts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'payouts', coalesce((
    select jsonb_agg(jsonb_build_object('id', 'P-' || p.id, 'therapist', t.name, 'netKes', p.net_kes, 'grossKes', p.gross_kes, 'feeKes', p.fee_kes, 'sessions', p.sessions, 'method', p.method,
      'status', p.status, 'requestedAt', private.ms(p.requested_at), 'paidBy', p.paid_by, 'reference', p.reference) order by (p.status = 'requested') desc, p.requested_at desc)
    from (select * from private.payouts order by requested_at desc limit 100) p join private.therapists t on t.id = p.therapist_id), '[]'::jsonb));
end;
$$;

create or replace function public.admin_mark_payout_paid(p_id text, p_reference text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  p private.payouts;
  ref text := btrim(coalesce(p_reference, ''));
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Only billing staff and Admins mark payouts paid.'); end if;
  if char_length(ref) < 3 then return private.fail('reference', 'Add the M-Pesa or bank reference for the payment.'); end if;
  select * into p from private.payouts where id = nullif(regexp_replace(coalesce(p_id, ''), '\D', '', 'g'), '')::bigint for update;
  if not found or p.status <> 'requested' then return private.fail('gone', 'This payout has been handled.'); end if;
  update private.payouts set status = 'paid', paid_by = s.name, paid_at = now(), reference = left(ref, 80) where id = p.id;
  perform private.staff_log(s, 'Marked payout paid', 'P-' || p.id, left(ref, 80));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_fee(), public.admin_propose_fee(int), public.admin_decide_fee(uuid, boolean), public.admin_withdraw_fee(uuid), public.portal_earnings(),
  public.portal_request_payout(), public.admin_payouts(), public.admin_mark_payout_paid(text, text) from public, anon;
grant execute on function public.admin_fee(), public.admin_propose_fee(int), public.admin_decide_fee(uuid, boolean), public.admin_withdraw_fee(uuid), public.portal_earnings(),
  public.portal_request_payout(), public.admin_payouts(), public.admin_mark_payout_paid(text, text) to authenticated;
