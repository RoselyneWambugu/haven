-- Verification documents are kept for 12 months after the decision they supported (decision Q-45). Run this ONCE in the Supabase SQL editor.
-- It deletes data, which the tooling used for migrations does not run, so it is kept apart. The editor will ask you to confirm.
--
-- A document is removed when it is over 12 months old AND the decision on it is over 12 months old:
--   an application document: the application was approved or rejected more than 12 months ago;
--   a renewal document: the renewal was approved or rejected more than 12 months ago.
-- Nothing is removed while an application is still pending or waiting for more information. Each day the job asks the
-- document-retention edge function to delete the stored files and then the records. It needs the same vault secret and
-- 'sms' drainUrl setting that the SMS sender uses.

create or replace function public.documents_expired(p_limit int default 100) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('paths', coalesce(jsonb_agg(x.path), '[]'::jsonb))
  from (
    select d.path from private.application_documents d
    where d.created_at < now() - interval '12 months'
      and not exists (select 1 from private.applications a where a.account_id = d.account_id and a.status in ('pending', 'info'))
      and case
        when d.renewal_id is not null then exists (select 1 from private.licence_renewals r where r.id = d.renewal_id and r.status in ('approved', 'rejected') and r.decided_at < now() - interval '12 months')
        else exists (select 1 from private.applications a where a.account_id = d.account_id and a.status in ('approved', 'rejected') and a.decided_at < now() - interval '12 months')
      end
    order by d.created_at limit greatest(1, least(p_limit, 500))
  ) x
$$;

create or replace function public.documents_forget(p_paths text[]) returns void
language sql security definer set search_path = ''
as $$ delete from private.application_documents where path = any(p_paths) $$;

revoke all on function public.documents_expired(int), public.documents_forget(text[]) from public, anon, authenticated;
grant execute on function public.documents_expired(int), public.documents_forget(text[]) to service_role;

create or replace function private.sweep_documents() returns void
language plpgsql set search_path = ''
as $$
declare
  tok text;
  url text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'sms_drain_token' limit 1;
  select replace(value->>'drainUrl', 'sms-drain', 'document-retention') into url from private.config where key = 'sms';
  if tok is null or url is null then return; end if;
  perform net.http_post(url := url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-drain-token', tok), body := '{}'::jsonb);
end;
$$;

revoke all on function private.sweep_documents() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'echo-sweep-documents';
select cron.schedule('echo-sweep-documents', '41 3 * * *', 'select private.sweep_documents()');
