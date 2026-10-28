-- Clean-up for group chats: 24 hours after a room ends, its messages and sign-ups are erased, unless a message in it was reported.
-- This deletes, so it is run once by hand in the Supabase SQL editor (the editor will warn about destructive operations; that is expected).
-- Safe to run more than once.

create or replace function private.sweep_groups() returns void
language plpgsql set search_path = ''
as $$
begin
  delete from private.group_chats g
  where g.retained_at is null
    and g.starts_at + make_interval(mins => g.duration_min) + interval '24 hours' < now();
end;
$$;
revoke all on function private.sweep_groups() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'echo-sweep-groups';
select cron.schedule('echo-sweep-groups', '*/15 * * * *', 'select private.sweep_groups()');

select 'group chat clean-up ready' as status;
