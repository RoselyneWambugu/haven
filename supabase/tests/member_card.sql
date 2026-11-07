-- The light card for a pen name returns only the month someone joined. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL PASSED (rolled back)". Any other text lists what failed.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r jsonb; k text; bad text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','254712000071',now(),now()),
   (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','254712000072',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Wanjiru Kamau', date '1995-05-05', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.register_member('Otieno Odhiambo', date '1994-04-04', null, 'RiverStone', 'leaf', array['English'], array[]::text[], 'v1');
  reset role;
  select public_key::text into k from public.profiles where account_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.member_card(k);
  if r->>'ok' is distinct from 'true' or (r->>'since') is null or r ? 'pen_name' then bad := bad || ('card: ' || r::text); end if;
  r := public.member_card('nonsense');
  if r->>'ok' = 'true' then bad := bad || 'bad key accepted'; end if;
  select public_key::text into k from public.profiles where account_id = b;
  r := public.member_card(k);
  if r->>'ok' = 'true' then bad := bad || 'own card'; end if;
  reset role;
  if array_length(bad,1)>0 then raise exception 'FAILED: %', array_to_string(bad,' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
