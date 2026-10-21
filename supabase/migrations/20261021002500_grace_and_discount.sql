-- Two settings that were stored but not enforced.
-- Grace period (D26): after a plan ends, peer chats stay readable but read-only for the configured number of days; after that they are hidden from the member.
-- Therapy discount: a plan can give a percentage off therapy sessions, applied to the price at checkout.
-- Nothing here uses delete or drop. The account-deletion holding period needs a deleting job: see supabase/account_deletion_cleanup.sql.

-- True while a plan is active, or ended less than the grace period ago.
create or replace function private.peer_chats_readable(p_account uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from private.subscriptions s where s.account_id = p_account and s.ends_at + make_interval(days => private.limit_int('graceDays', 7)) > now())
$$;

select private.patch_function('public.my_chats()'::regprocedure,
  'where me\.account_id = uid and not me\.hidden and c\.kind in \(''peer'', ''therapist''\)',
  'where me.account_id = uid and not me.hidden and c.kind in (''peer'', ''therapist'') and (c.kind <> ''peer'' or private.peer_chats_readable(uid))', 'peer_chats_readable(uid)');

-- The percentage a member's current plan takes off therapy sessions (0 without an active plan).
create or replace function private.therapy_discount_pct(p_account uuid) returns int
language sql stable set search_path = ''
as $$
  select coalesce((select p.therapist_discount_pct from private.subscriptions s join private.plans p on p.id = s.plan_id where s.account_id = p_account and s.ends_at > now()), 0)
$$;

create or replace function private.discounted_price(p_account uuid, p_price int) returns int
language sql stable set search_path = ''
as $$ select case when p_price is null then null else round(p_price * (100 - private.therapy_discount_pct(p_account)) / 100.0)::int end $$;

select private.patch_function('public.start_session_checkout(text, text, timestamptz)'::regprocedure,
  'values \(uid, ''session'', t\.id, p_mode, p_start, t\.price_kes\)',
  'values (uid, ''session'', t.id, p_mode, p_start, private.discounted_price(uid, t.price_kes))', 'discounted_price(uid, t.price_kes))');
select private.patch_function('public.start_session_checkout(text, text, timestamptz)'::regprocedure,
  '''amount_kes'', t\.price_kes, ''title'', ''Session with '' \|\| t\.name',
  '''amount_kes'', private.discounted_price(uid, t.price_kes), ''list_kes'', t.price_kes, ''discount_pct'', private.therapy_discount_pct(uid), ''title'', ''Session with '' || t.name', '''discount_pct''');

revoke all on all functions in schema private from public, anon, authenticated;
