-- Foundation checks. Runs in one transaction and always rolls back (the final raise).
-- Success: the error text is "ALL FOUNDATION CHECKS PASSED". Any other error text is a failure.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  r jsonb;
  n int;
  failures text[] := '{}';
  procedure_note text;
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
    values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254712345678', now(), now()),
           (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '254722345678', now(), now());

  -- Act as member A.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r := public.register_member('Wanjiru Kamau', date '2010-01-01', null, 'QuietPine', 'moon', array['English'], array['Grief'], 'v1');
  if r->>'code' is distinct from 'under-18' then failures := failures || ('under-18 not refused: ' || r::text); end if;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'Admin', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'reserved' then failures := failures || ('reserved: ' || r::text); end if;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'Wanjiru_X', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'real-name' then failures := failures || ('real-name: ' || r::text); end if;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'ab', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'length' then failures := failures || ('length: ' || r::text); end if;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'QuietPine', 'moon', array['Klingon'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'languages' then failures := failures || ('languages: ' || r::text); end if;
  select count(*) into n from public.accounts; if n <> 0 then failures := failures || 'refused signups left rows'; end if;

  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'QuietPine', 'moon', array['English','Kiswahili'], array['Grief'], 'v1');
  if r->>'ok' is distinct from 'true' or r->>'age_band' <> '25-34' then failures := failures || ('register A: ' || r::text); end if;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'Other', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'already-registered' then failures := failures || ('double register: ' || r::text); end if;

  r := public.change_pen_name('QuietPine2');
  if r->>'ok' is distinct from 'true' then failures := failures || ('first change: ' || r::text); end if;
  r := public.change_pen_name('QuietPine3');
  if r->>'code' is distinct from 'limit' then failures := failures || ('30-day limit: ' || r::text); end if;

  r := public.update_settings('{"appLock": true, "evil": 1, "lockAfterSeconds": 30}');
  if r->>'ok' is distinct from 'true' then failures := failures || ('settings: ' || r::text); end if;
  r := public.update_settings('{"appLock": "yes"}');
  if r->>'ok' = 'true' then failures := failures || 'bad setting type accepted'; end if;
  r := public.set_mood(9);
  if r->>'ok' = 'true' then failures := failures || 'mood 9 accepted'; end if;
  r := public.set_mood(4);
  r := public.trust_device(true, 'Pixel', 'phone', 'Nairobi');

  r := public.my_account();
  if r->'public'->>'pen_name' <> 'QuietPine2' or r->'private'->>'phone' <> '+254712345678'
     or (r->'settings'->>'lockAfterSeconds')::int <> 30 or r->'settings' ? 'evil'
     or jsonb_array_length(r->'devices') <> 1 then failures := failures || ('my_account: ' || r::text); end if;

  -- Act as member B.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r := public.register_member('Achieng Otieno', date '1990-01-01', 'a@b.co', 'quietpine2', 'leaf', array['English'], array[]::text[], 'v1');
  if r->>'code' is distinct from 'taken' then failures := failures || ('taken (case-insensitive): ' || r::text); end if;
  r := public.register_member('Achieng Otieno', date '1990-01-01', 'a@b.co', 'RiverStone', 'leaf', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then failures := failures || ('register B: ' || r::text); end if;

  select count(*) into n from public.profiles;   if n <> 1 then failures := failures || format('B sees %s profiles', n); end if;
  select count(*) into n from public.accounts;   if n <> 1 then failures := failures || format('B sees %s accounts', n); end if;
  select count(*) into n from public.consents;   if n <> 1 then failures := failures || format('B sees %s consents', n); end if;
  select count(*) into n from public.devices;    if n <> 0 then failures := failures || format('B sees %s devices', n); end if;
  r := public.revoke_device((select id from public.devices limit 1));
  begin
    perform 1 from private.identities;
    failures := failures || 'B could read private.identities';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set pen_name = 'Hacked' where account_id = a;
    get diagnostics n = row_count;
    failures := failures || 'B could update a profile directly';
  exception when insufficient_privilege then null; end;

  -- Signed out (anon) sees and does nothing.
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.my_account();
    failures := failures || 'anon called my_account';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.profiles;
    failures := failures || 'anon read profiles';
  exception when insufficient_privilege then null; end;

  reset role;
  if array_length(failures, 1) is not null then
    raise exception 'FOUNDATION FAILURES: %', array_to_string(failures, ' | ');
  end if;
  raise exception 'ALL FOUNDATION CHECKS PASSED';
end $$;
