-- Application document checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; appid uuid; docid uuid; n int; ok boolean;
  chk jsonb := '{"name":true,"licence":true,"expiry":true,"qualification":true}';
begin
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471900022' || i, now(), now());
  end loop;
  -- 1 clinical, 2 moderator, 3 applicant, 4 another applicant
  insert into private.staff (account_id, name, role) values (ids[1], 'C. Clin', 'clinical'), (ids[2], 'M. Mod', 'moderator');

  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.submit_application('Dr. Test Applicant', 'Counsellor', 'woman', 'CPB-77', current_date + 400, true, true);
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;

  -- Storage: the applicant can add to their own folder only.
  begin
    insert into storage.objects (bucket_id, name, owner) values ('applications', ids[4]::text || '/licence-x.pdf', ids[3]);
    bad := array_append(bad, 'wrote into another folder');
  exception when others then null; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('applications', ids[3]::text || '/licence-1.pdf', ids[3]);
  exception when others then bad := array_append(bad, 'could not write to own folder: ' || sqlerrm); end;

  -- Registering.
  r := public.register_document('licence', ids[3]::text || '/licence-1.pdf', 'licence.pdf', 120000);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('register: ' || r::text)); end if;
  r := public.register_document('licence', ids[4]::text || '/licence-x.pdf', 'x.pdf', 1000);
  if r->>'code' is distinct from 'path' then bad := array_append(bad, 'registered another folder'); end if;
  r := public.register_document('licence', ids[3]::text || '/../' || ids[4]::text || '/y.pdf', 'y.pdf', 1000);
  if r->>'code' is distinct from 'path' then bad := array_append(bad, 'path escape'); end if;
  r := public.register_document('licence', ids[3]::text || '/never-uploaded.pdf', 'z.pdf', 1000);
  if r->>'code' is distinct from 'missing' then bad := array_append(bad, 'registered a missing file'); end if;
  r := public.register_document('licence', ids[3]::text || '/licence-1.pdf', 'big.pdf', 9000000);
  if r->>'code' is distinct from 'size' then bad := array_append(bad, 'oversize'); end if;
  r := public.register_document('selfie', ids[3]::text || '/licence-1.pdf', 'a.pdf', 100);
  if r->>'code' is distinct from 'kind' then bad := array_append(bad, 'unknown kind'); end if;
  r := public.register_document('renewal', ids[3]::text || '/licence-1.pdf', 'a.pdf', 100);
  if r->>'code' is distinct from 'kind' then bad := array_append(bad, 'applicant sent a renewal'); end if;
  r := public.my_documents();
  if jsonb_array_length(r->'documents') <> 1 then bad := array_append(bad, ('my_documents: ' || r::text)); end if;

  -- The other applicant sees nothing of it.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_documents();
  if jsonb_array_length(r->'documents') <> 0 then bad := array_append(bad, 'saw another applicant files'); end if;
  select count(*) into n from storage.objects where bucket_id = 'applications';
  if n <> 0 then bad := array_append(bad, 'storage readable by another applicant: ' || n); end if;

  -- A moderator can't see files; a clinical reviewer can.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'applications';
  if n <> 0 then bad := array_append(bad, 'moderator reads storage'); end if;
  r := public.admin_documents(null, null);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator listed documents'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'applications';
  if n <> 1 then bad := array_append(bad, 'clinical cannot read storage: ' || n); end if;
  r := public.admin_applicants();
  appid := (r->'applicants'->0->>'id')::uuid;
  r := public.admin_documents(appid, null);
  if jsonb_array_length(r->'documents') <> 1 then bad := array_append(bad, ('admin_documents: ' || r::text)); end if;
  docid := (r->'documents'->0->>'id')::uuid;
  r := public.admin_open_document(docid);
  if r->>'path' is distinct from ids[3]::text || '/licence-1.pdf' then bad := array_append(bad, ('open: ' || r::text)); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Opened a verification document') then bad := array_append(bad, 'open not logged'); end if;

  -- Approval needs a licence document.
  update private.application_documents set kind = 'id' where id = docid;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_verify_applicant(appid, 'approved', 'All checks done', chk);
  if r->>'code' is distinct from 'document' then bad := array_append(bad, ('approved without licence file: ' || r::text)); end if;
  reset role; update private.application_documents set kind = 'licence' where id = docid;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_verify_applicant(appid, 'approved', 'All checks done', chk);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('approve: ' || r::text)); end if;

  -- A therapist's renewal needs the renewed certificate.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_submit_renewal('CPB-78', current_date + 800);
  if r->>'code' is distinct from 'document' then bad := array_append(bad, ('renewal without file: ' || r::text)); end if;
  insert into storage.objects (bucket_id, name, owner) values ('applications', ids[3]::text || '/renewal-1.pdf', ids[3]);
  r := public.register_document('renewal', ids[3]::text || '/renewal-1.pdf', 'renewal.pdf', 90000);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('register renewal: ' || r::text)); end if;
  r := public.register_document('licence', ids[3]::text || '/licence-1.pdf', 'again.pdf', 100);
  if r->>'code' is distinct from 'kind' then bad := array_append(bad, 'therapist sent an application file'); end if;
  r := public.portal_submit_renewal('CPB-78', current_date + 800);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('renewal: ' || r::text)); end if;
  r := public.my_documents();
  if not exists (select 1 from jsonb_array_elements(r->'documents') x where x->>'kind' = 'renewal' and (x->>'sent')::boolean) then bad := array_append(bad, 'renewal file not attached'); end if;

  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
