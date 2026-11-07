-- Watch episodes: who can add, publish and see them. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL PASSED (rolled back)". Any other text lists what failed.
do $$
declare
  adm uuid := gen_random_uuid(); mod uuid := gen_random_uuid(); paid uuid := gen_random_uuid(); free uuid := gen_random_uuid();
  eid uuid := gen_random_uuid(); eid2 uuid := gen_random_uuid();
  r jsonb; bad text[] := '{}'; n int := 60; u uuid; k int;
begin
  foreach u in array array[adm, mod, paid, free] loop
    n := n + 1;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2547120000' || n, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
    r := public.register_member('Test Person', date '1995-05-05', null, 'Pen' || n, 'moon', array['English'], array[]::text[], 'v1');
    reset role;
  end loop;
  insert into private.staff (account_id, name, role, heavy) values (adm, 'A. Admin', 'admin', false), (mod, 'M. Moderator', 'moderator', false);
  insert into private.subscriptions (account_id, plan_id, ends_at, auto_renew, method, receipt_no) values (paid, 'monthly', now() + interval '10 days', false, 'mpesa', 'T-EP-1');

  -- a moderator can't add; the video has to be there first
  perform set_config('request.jwt.claims', json_build_object('sub', mod, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_add_episode(eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', null, 1800, 1000);
  if r->>'code' is distinct from 'role' then bad := bad || ('moderator added: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true); set local role authenticated;
  r := public.admin_add_episode(eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', null, 1800, 1000);
  if r->>'code' is distinct from 'role' then bad := bad || ('aal1 added: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_add_episode(eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', null, 1800, 1000);
  if r->>'code' is distinct from 'missing' then bad := bad || ('no file: ' || r::text); end if;
  reset role;
  insert into storage.objects (bucket_id, name) values ('episodes', 'v/' || eid || '/video.mp4');
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_add_episode(eid, 'short', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', null, 1800, 1000);
  if r->>'code' is distinct from 'title' then bad := bad || ('short title: ' || r::text); end if;
  r := public.admin_add_episode(eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid2 || '/video.mp4', null, 1800, 1000);
  if r->>'code' is distinct from 'path' then bad := bad || ('wrong folder: ' || r::text); end if;
  r := public.admin_add_episode(eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', 'v/' || eid || '/poster.jpg', 1800, 1000);
  if r->>'code' is distinct from 'poster' then bad := bad || ('missing poster: ' || r::text); end if;
  r := public.admin_add_episode(eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', null, 1800, 1000);
  if r->>'ok' is distinct from 'true' then bad := bad || ('add: ' || r::text); end if;
  reset role;

  -- a draft is hidden from members, even with a plan
  perform set_config('request.jwt.claims', json_build_object('sub', paid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episodes_list();
  if jsonb_array_length(r->'episodes') <> 0 then bad := bad || ('draft listed: ' || r::text); end if;
  r := public.episode_access(eid);
  if r->>'code' is distinct from 'gone' then bad := bad || ('draft playable: ' || r::text); end if;
  reset role;

  -- publish: the member with a plan sees it, a member without one doesn't
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_set_episode_published(eid, true);
  if r->>'ok' is distinct from 'true' then bad := bad || ('publish: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', paid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episodes_list();
  if jsonb_array_length(r->'episodes') <> 1 then bad := bad || ('not listed: ' || r::text); end if;
  r := public.episode_access(eid);
  if r->>'ok' is distinct from 'true' or r->>'video_path' <> 'v/' || eid || '/video.mp4' then bad := bad || ('no access: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', free, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episodes_list();
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('free listed: ' || r::text); end if;
  r := public.episode_access(eid);
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('free played: ' || r::text); end if;
  r := public.admin_episodes();
  if r->>'ok' = 'true' then bad := bad || 'member saw the staff list'; end if;
  reset role;

  -- unpublish hides it again; edit works; both are logged
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_edit_episode(eid, 'Red table, week one (edit)', 'A first conversation about talking to people we love, edited.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('edit: ' || r::text); end if;
  r := public.admin_set_episode_published(eid, false);
  if r->>'ok' is distinct from 'true' then bad := bad || ('unpublish: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', paid, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episodes_list();
  if jsonb_array_length(r->'episodes') <> 0 then bad := bad || 'unpublished still listed'; end if;
  reset role;
  select count(*) into k from private.audit where action in ('Added an episode', 'Published an episode', 'Unpublished an episode', 'Edited an episode');
  if k <> 4 then bad := bad || ('audit count ' || k); end if;

  if array_length(bad, 1) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
