-- Documents for therapist applications and licence renewals (PRD THR-2: the verification records the document).
-- Files live in a private storage bucket, one folder per person. The applicant can add files to their own folder and read them;
-- clinical reviewers and Admins can read any file. Opening a file for review is written to the audit log.
-- Nothing here uses delete or drop. Files are kept as the record of the verification.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applications', 'applications', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create table if not exists private.application_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('licence', 'id', 'qualification', 'renewal')),
  path text not null unique,
  name text not null,
  size int not null check (size > 0),
  renewal_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists application_documents_idx on private.application_documents (account_id, created_at desc);
alter table private.application_documents enable row level security;

-- Storage can't see the private schema, so the policy asks this.
create or replace function public.can_review_documents() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.staff s where s.account_id = (select auth.uid()) and s.active and s.role in ('clinical', 'admin')) $$;
revoke execute on function public.can_review_documents() from public, anon;
grant execute on function public.can_review_documents() to authenticated;

create policy applications_add_own on storage.objects for insert to authenticated
  with check (bucket_id = 'applications' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy applications_read on storage.objects for select to authenticated
  using (bucket_id = 'applications' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_review_documents()));

-- The person tells the server about a file they uploaded. The server checks it is in their folder and really exists.
create or replace function public.register_document(p_kind text, p_path text, p_name text, p_size int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  nm text := left(btrim(coalesce(p_name, '')), 120);
begin
  if p_kind not in ('licence', 'id', 'qualification', 'renewal') then return private.fail('kind', 'Choose what kind of document it is.'); end if;
  if p_kind = 'renewal' and private.therapist_of(uid) is null then return private.fail('kind', 'Only a therapist can send a renewal.'); end if;
  if p_kind <> 'renewal' and private.therapist_of(uid) is not null then return private.fail('kind', 'You are already a verified therapist.'); end if;
  if p_path is null or left(p_path, char_length(uid::text) + 1) <> uid::text || '/' or position('..' in p_path) > 0 then return private.fail('path', 'That file isn’t in your folder.'); end if;
  if nm = '' then return private.fail('name', 'The file needs a name.'); end if;
  if p_size is null or p_size <= 0 or p_size > 5242880 then return private.fail('size', 'Files can be up to 5 MB.'); end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'applications' and o.name = p_path) then return private.fail('missing', 'We couldn’t find the file you uploaded. Try again.'); end if;
  if (select count(*) from private.application_documents where account_id = uid) >= 12 then return private.fail('limit', 'You have sent the most files allowed. Contact help to add more.'); end if;
  insert into private.application_documents (account_id, kind, path, name, size) values (uid, p_kind, p_path, nm, p_size) on conflict (path) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.my_documents() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'documents', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name, 'size', d.size, 'at', private.ms(d.created_at), 'sent', d.renewal_id is not null) order by d.created_at desc)
    from private.application_documents d where d.account_id = uid), '[]'::jsonb));
end;
$$;

-- Staff: the files for an application or a therapist's renewals. Clinical reviewers and Admins only.
create or replace function public.admin_documents(p_application uuid default null, p_therapist text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  acct uuid;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Not allowed.'); end if;
  if p_application is not null then select account_id into acct from private.applications where id = p_application;
  elsif p_therapist is not null then select account_id into acct from private.therapists where id = p_therapist; end if;
  return jsonb_build_object('ok', true, 'documents', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name, 'size', d.size, 'at', private.ms(d.created_at)) order by d.created_at desc)
    from private.application_documents d where d.account_id = acct), '[]'::jsonb));
end;
$$;

-- Opening a file is recorded, then the app asks storage for a short-lived link to the path returned here.
create or replace function public.admin_open_document(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  d private.application_documents;
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Only clinical reviewers and Admins open these files.'); end if;
  select * into d from private.application_documents where id = p_id;
  if not found then return private.fail('gone', 'That file isn’t here.'); end if;
  perform private.staff_log(s, 'Opened a verification document', d.kind || ': ' || d.name, '');
  return jsonb_build_object('ok', true, 'path', d.path, 'name', d.name);
end;
$$;

-- An application can't be approved without a licence document.
select private.patch_function('public.admin_verify_applicant(uuid, text, text, jsonb)'::regprocedure,
  'if char_length\(msg\) < 5 then return private\.fail\(''message'', ''Write a message to the applicant\.''\); end if;',
  'if p_decision = ''approved'' and not exists (select 1 from private.application_documents d where d.account_id = a.account_id and d.kind = ''licence'') then return private.fail(''document'', ''The applicant hasn’t sent a licence document yet.''); end if;
  if char_length(msg) < 5 then return private.fail(''message'', ''Write a message to the applicant.''); end if;', 'hasn’t sent a licence document');

-- A renewal needs the renewed certificate: the files sent since the last renewal are attached to it.
create or replace function public.portal_submit_renewal(p_number text, p_expiry date) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  tid text := private.therapist_of(uid);
  t private.therapists;
  ln text := btrim(coalesce(p_number, ''));
  rid uuid;
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into t from private.therapists where id = tid;
  if ln = '' or char_length(ln) > 40 then return private.fail('licence', 'Add your licence number.'); end if;
  if p_expiry is null or p_expiry <= private.today() or p_expiry <= t.licence_valid_to then return private.fail('expiry', 'The new expiry date must be later than your current one.'); end if;
  if p_expiry > private.today() + 1830 then return private.fail('expiry', 'That date is too far ahead. Check it against your certificate.'); end if;
  if exists (select 1 from private.licence_renewals where therapist_id = tid and status = 'pending') then return private.fail('pending', 'Your renewal is already with a reviewer.'); end if;
  if not exists (select 1 from private.application_documents where account_id = uid and kind = 'renewal' and renewal_id is null) then return private.fail('document', 'Attach your renewed certificate first.'); end if;
  insert into private.licence_renewals (therapist_id, licence_number, new_expiry) values (tid, ln, p_expiry) returning id into rid;
  update private.application_documents set renewal_id = rid where account_id = uid and kind = 'renewal' and renewal_id is null;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.register_document(text, text, text, int), public.my_documents(), public.admin_documents(uuid, text), public.admin_open_document(uuid) from public, anon;
grant execute on function public.register_document(text, text, text, int), public.my_documents(), public.admin_documents(uuid, text), public.admin_open_document(uuid) to authenticated;
