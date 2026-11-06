-- Three follow-ups to the session money rules.
-- 1. A member who joined the session can't be marked a no-show: joining (chat, voice or video) is recorded, and the therapist's wrap-up refuses a
--    no-show when the client joined. The therapist's session list carries when the client joined, so the wrap-up screen can say so.
-- 2. A therapist sees what a late cancellation earned them: their share of the 10% fee shows in Earnings, and is paid out like any other earning.
-- 3. A member whose therapist did not come gets a discount (10% by default, for 90 days) on their next booking with that same therapist. It is
--    set in private.config (sessionMoney: flakeDiscountPct, 0 turns it off; flakeDiscountDays). Echo bears the discount: the therapist is paid and
--    charged the platform fee on their listed price, so the discount costs them nothing. It is used once, when that booking is paid.
-- Nothing here removes data.

update private.config set value = value || '{"flakeDiscountPct":10,"flakeDiscountDays":90}'::jsonb where key = 'sessionMoney';

alter table private.sessions add column if not exists member_joined_at timestamptz;
alter table private.sessions add column if not exists list_kes int;
alter table private.sessions add column if not exists flake_discount_pct int;
alter table private.sessions add column if not exists flake_discount_until timestamptz;
alter table private.sessions add column if not exists discount_used_order uuid;
alter table private.orders add column if not exists list_kes int;
alter table private.orders add column if not exists flake_session_id uuid;

-- ---------------------------------------------------------------- 1. the client joined
select private.replace_in_function('public.join_session(uuid)'::regprocedure,
  'The session isn’t open yet.''); end if;
  return jsonb_build_object(''ok'', true);',
  'The session isn’t open yet.''); end if;
  update private.sessions set member_joined_at = coalesce(member_joined_at, now()) where id = p_id;
  return jsonb_build_object(''ok'', true);', 'member_joined_at');

select private.replace_in_function('public.portal_wrap_up(uuid, text, text, timestamptz)'::regprocedure,
  'return private.fail(''gone'', ''Session not found.''); end if;',
  'return private.fail(''gone'', ''Session not found.''); end if;
  if p_attendance = ''no-show'' and s.member_joined_at is not null then return private.fail(''joined'', ''This client joined the session, so it can’t be marked as a no-show.''); end if;', 'member_joined_at is not null');

select private.replace_in_function('public.my_portal()'::regprocedure,
  '''gross_kes'', s.gross_kes, ''fee_kes'', s.fee_kes) order by s.start_at)',
  '''gross_kes'', s.gross_kes, ''fee_kes'', s.fee_kes, ''client_joined'', (extract(epoch from s.member_joined_at) * 1000)::bigint) order by s.start_at)', '''client_joined''');

-- ---------------------------------------------------------------- 2. what a late cancellation earned
select private.replace_in_function('public.my_portal()'::regprocedure,
  '    ''threads'', coalesce((',
  '    ''late_cancels'', coalesce((
      select jsonb_agg(jsonb_build_object(''id'', c.id, ''client_name'', pr.pen_name, ''mode'', c.mode, ''start'', (extract(epoch from c.start_at) * 1000)::bigint,
        ''end'', (extract(epoch from c.end_at) * 1000)::bigint, ''gross_kes'', c.gross_kes, ''fee_kes'', c.fee_kes) order by c.start_at desc)
      from private.sessions c join public.profiles pr on pr.account_id = c.member_id
      where c.therapist_id = tid and c.status = ''cancelled'' and c.gross_kes is not null and c.start_at > now() - interval ''120 days''), ''[]''::jsonb),
    ''threads'', coalesce((', '''late_cancels''');

-- ---------------------------------------------------------------- 3. the rebooking discount
create or replace function private.flake_offer(p_account uuid, p_therapist text) returns uuid
language sql stable set search_path = ''
as $$
  select s.id from private.sessions s
  where s.member_id = p_account and s.therapist_id = p_therapist and s.flaked and coalesce(s.flake_discount_pct, 0) > 0
    and s.discount_used_order is null and s.flake_discount_until > now()
  order by s.flake_discount_until limit 1
$$;

-- The bigger of the plan's discount and the missed-session discount. They don't add up.
create or replace function private.checkout_pct(p_account uuid, p_therapist text) returns int
language sql stable set search_path = ''
as $$ select greatest(private.therapy_discount_pct(p_account), coalesce((select s.flake_discount_pct from private.sessions s where s.id = private.flake_offer(p_account, p_therapist)), 0)) $$;

create or replace function private.checkout_price(p_account uuid, p_therapist text, p_price int) returns int
language sql stable set search_path = ''
as $$ select case when p_price is null then null else round(p_price * (100 - private.checkout_pct(p_account, p_therapist)) / 100.0)::int end $$;

select private.replace_in_function('public.start_session_checkout(text, text, timestamptz)'::regprocedure,
  'private.discounted_price(uid, t.price_kes)', 'private.checkout_price(uid, t.id, t.price_kes)', 'private.checkout_price(');
select private.replace_in_function('public.start_session_checkout(text, text, timestamptz)'::regprocedure,
  '''discount_pct'', private.therapy_discount_pct(uid),',
  '''discount_pct'', private.checkout_pct(uid, t.id), ''discount_note'', case when private.checkout_pct(uid, t.id) > private.therapy_discount_pct(uid) then t.name || '' missed your last session'' end,', '''discount_note''');
select private.replace_in_function('public.start_session_checkout(text, text, timestamptz)'::regprocedure,
  'returning id into oid;',
  'returning id into oid;
  update private.orders set list_kes = t.price_kes,
    flake_session_id = case when private.checkout_pct(uid, t.id) > private.therapy_discount_pct(uid) then private.flake_offer(uid, t.id) end where id = oid;', 'flake_session_id = case');

-- Paying uses up the discount, and the session remembers the listed price so the therapist is paid on it.
select private.replace_in_function('private.settle_order(uuid, text, text)'::regprocedure,
  'failure = null, session_id = sid where id = p_order;',
  'failure = null, session_id = sid where id = p_order;
    update private.sessions set list_kes = coalesce(o.list_kes, o.amount_kes) where id = sid;
    if o.flake_session_id is not null then update private.sessions set discount_used_order = o.id where id = o.flake_session_id and discount_used_order is null; end if;', 'discount_used_order');

select private.replace_in_function('public.portal_wrap_up(uuid, text, text, timestamptz)'::regprocedure,
  'else s.price_kes end,', 'else coalesce(s.list_kes, s.price_kes) end,', 'coalesce(s.list_kes');
select private.replace_in_function('public.portal_wrap_up(uuid, text, text, timestamptz)'::regprocedure,
  'round(s.price_kes * private.platform_fee_pct()', 'round(coalesce(s.list_kes, s.price_kes) * private.platform_fee_pct()', 'round(coalesce(s.list_kes');

-- A therapist who did not come: the member earns the discount.
select private.replace_in_function('public.report_therapist_late(uuid)'::regprocedure,
  'flaked = true where id = p_id;',
  'flaked = true,
    flake_discount_pct = nullif(private.money_cfg(''flakeDiscountPct'', 10), 0),
    flake_discount_until = now() + make_interval(days => private.money_cfg(''flakeDiscountDays'', 90)) where id = p_id;', 'flake_discount_pct');

-- The member's session list carries the offer, so the app can show it before booking.
select private.replace_in_function('public.my_sessions()'::regprocedure,
  '''flaked'', s.flaked,',
  '''flaked'', s.flaked, ''flake_discount_pct'', s.flake_discount_pct, ''flake_discount_until'', (extract(epoch from s.flake_discount_until) * 1000)::bigint, ''discount_used'', s.discount_used_order is not null,', '''flake_discount_pct''');

revoke all on all functions in schema private from public, anon, authenticated;

-- A plan's checkout title no longer says "peer plan" (a plan opens the whole of Echo).
select private.replace_in_function('public.start_checkout(text, boolean)'::regprocedure, ' peer plan', ' plan', 'peer-plan-removed');
