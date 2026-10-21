-- Safe to run more than once. Paste the whole file into the Supabase SQL editor.
-- Echo backend, slice 4: plans, checkout and the plan check for the whole platform.
-- No payment provider is connected yet. A real provider calls confirm_payment() from an edge function (service role only).
-- Until then, simulate_payment() works only for phone numbers listed in private.payment_test_phones.

create table if not exists private.plans (
  id text primary key,
  label text not null,
  days int not null check (days > 0),
  -- These amounts are the same sample figures the app shows. The real prices are still to be decided.
  price_kes int check (price_kes is null or price_kes >= 0),
  enabled boolean not null default true
);
insert into private.plans (id, label, days, price_kes) values
  ('daily', 'Daily', 1, 100),
  ('monthly', 'Monthly', 30, 1500),
  ('yearly', 'Yearly', 365, 12000)
on conflict (id) do nothing;

create table if not exists private.subscriptions (
  account_id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null references private.plans (id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  auto_renew boolean not null default true,
  cancelled_at timestamptz,
  method text not null check (method in ('mpesa', 'card')),
  receipt_no text not null
);

create table if not exists private.orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references private.plans (id),
  auto_renew boolean not null default true,
  amount_kes int,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  method text check (method in ('mpesa', 'card')),
  provider_ref text,
  receipt_no text,
  failure text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_account_idx on private.orders (account_id, created_at desc);
create unique index if not exists orders_provider_ref_idx on private.orders (provider_ref) where provider_ref is not null;

-- Phone numbers (as +254...) whose payments may be simulated. Add your test numbers here; leave it empty for real use.
create table if not exists private.payment_test_phones (phone text primary key);

alter table private.plans enable row level security;
alter table private.subscriptions enable row level security;
alter table private.orders enable row level security;
alter table private.payment_test_phones enable row level security;

-- From now on this is the real plan check used by matching, chat and the community.
create or replace function private.has_plan(p_account uuid) returns boolean
language sql stable set search_path = ''
as $$ select exists (select 1 from private.subscriptions s where s.account_id = p_account and s.ends_at > now()) $$;

-- Records a paid order and gives the member their plan, or adds to it if they already have one.
create or replace function private.apply_paid_order(p_order uuid, p_method text, p_provider_ref text) returns text
language plpgsql set search_path = ''
as $$
declare
  o private.orders;
  pl private.plans;
  cur private.subscriptions;
  rcpt text := 'EC-' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
  starts timestamptz;
begin
  select * into o from private.orders where id = p_order for update;
  if not found then return null; end if;
  if o.status = 'paid' then return o.receipt_no; end if;
  select * into pl from private.plans where id = o.plan_id;
  select * into cur from private.subscriptions where account_id = o.account_id;
  starts := case when cur.account_id is not null and cur.ends_at > now() then cur.ends_at else now() end;
  update private.orders set status = 'paid', method = p_method, provider_ref = p_provider_ref, receipt_no = rcpt, paid_at = now(), failure = null where id = p_order;
  insert into private.subscriptions (account_id, plan_id, started_at, ends_at, auto_renew, cancelled_at, method, receipt_no)
    values (o.account_id, o.plan_id, now(), starts + make_interval(days => pl.days), o.auto_renew, null, p_method, rcpt)
  on conflict (account_id) do update set plan_id = excluded.plan_id, started_at = excluded.started_at, ends_at = excluded.ends_at,
    auto_renew = excluded.auto_renew, cancelled_at = null, method = excluded.method, receipt_no = excluded.receipt_no;
  return rcpt;
end;
$$;

create or replace function public.my_plan() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object(
    'ok', true,
    'subscription', (select jsonb_build_object('plan_id', s.plan_id, 'started_at', s.started_at, 'ends_at', s.ends_at, 'auto_renew', s.auto_renew,
                                               'cancelled_at', s.cancelled_at, 'method', s.method, 'receipt_no', s.receipt_no)
                     from private.subscriptions s where s.account_id = uid),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'days', p.days, 'price_kes', p.price_kes, 'enabled', p.enabled) order by p.days) from private.plans p), '[]'::jsonb)
  );
end;
$$;

create or replace function public.start_checkout(p_plan text, p_auto_renew boolean default true) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  pl private.plans;
  oid uuid;
begin
  if not exists (select 1 from public.accounts where account_id = uid) then return private.fail('no-account', 'Sign in first.'); end if;
  select * into pl from private.plans where id = p_plan and enabled;
  if not found then return private.fail('plan', 'That plan is not available.'); end if;
  update private.orders set status = 'cancelled' where account_id = uid and status = 'pending';
  insert into private.orders (account_id, plan_id, auto_renew, amount_kes) values (uid, pl.id, coalesce(p_auto_renew, true) and pl.days > 1, pl.price_kes) returning id into oid;
  return jsonb_build_object('ok', true, 'order_id', oid, 'amount_kes', pl.price_kes, 'title', pl.label || ' peer plan');
end;
$$;

create or replace function public.cancel_checkout(p_order uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.orders set status = 'cancelled' where id = p_order and account_id = uid and status = 'pending';
  return jsonb_build_object('ok', true);
end;
$$;

-- For people on the test list only. A real provider replaces this with confirm_payment().
create or replace function public.simulate_payment(p_order uuid, p_method text, p_outcome text default 'success') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  o private.orders;
  rcpt text;
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
  rcpt := private.apply_paid_order(p_order, p_method, 'test:' || p_order::text);
  return jsonb_build_object('ok', true, 'receipt_no', rcpt);
end;
$$;

-- Called by the payment provider's webhook (an edge function using the service role). Never by the app.
create or replace function public.confirm_payment(p_order uuid, p_provider_ref text, p_method text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare rcpt text;
begin
  if p_method not in ('mpesa', 'card') then return private.fail('method', 'Unknown method.'); end if;
  rcpt := private.apply_paid_order(p_order, p_method, p_provider_ref);
  if rcpt is null then return private.fail('gone', 'No such order.'); end if;
  return jsonb_build_object('ok', true, 'receipt_no', rcpt);
end;
$$;

create or replace function public.cancel_plan() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.subscriptions set auto_renew = false, cancelled_at = now() where account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_auto_renew(p_on boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.subscriptions set auto_renew = p_on, cancelled_at = case when p_on then null else coalesce(cancelled_at, now()) end where account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare f text;
begin
  for f in select unnest(array['my_plan()', 'start_checkout(text,boolean)', 'cancel_checkout(uuid)', 'simulate_payment(uuid,text,text)', 'cancel_plan()', 'set_auto_renew(boolean)'])
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.confirm_payment(uuid, text, text) from public, anon, authenticated;
  grant execute on function public.confirm_payment(uuid, text, text) to service_role;
end $$;
revoke all on all functions in schema private from public, anon, authenticated;

select 'billing ready' as status, (select count(*) from private.plans) as plans;
