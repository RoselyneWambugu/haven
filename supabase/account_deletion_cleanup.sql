-- Account deletion after the holding period (decision D34). Run this ONCE in the Supabase SQL editor.
-- It deletes data, which the tooling used for migrations does not run, so it is kept apart. The editor will ask you to confirm.
--
-- A member who asks to delete their account is held for the number of days set under Configuration (default 14). Signing in again
-- cancels the request. After the holding period this job deletes the account, and with it everything that belongs to it: profile,
-- chats and messages, sessions, posts and comments, orders and receipts. Staff and therapist accounts are never deleted this way.
--
-- Open decisions (see docs/BACKLOG.md): whether posts the member chose to keep should stay under no name, and how long payment records
-- must be kept for accounting. Today everything goes with the account.

create or replace function private.sweep_accounts() returns void
language plpgsql set search_path = ''
as $$
begin
  delete from auth.users u
  using public.accounts a
  where a.account_id = u.id
    and a.deletion_requested_at is not null
    and a.deletion_requested_at < now() - make_interval(days => private.limit_int('deletionHoldDays', 14))
    and not exists (select 1 from private.staff s where s.account_id = u.id)
    and not exists (select 1 from private.therapists t where t.account_id = u.id);
end;
$$;

revoke all on function private.sweep_accounts() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'echo-sweep-accounts';
select cron.schedule('echo-sweep-accounts', '17 * * * *', 'select private.sweep_accounts()');
