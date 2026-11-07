-- Post screening: a high score holds a post, a self-harm score never does, several reports hold one, a moderator's approval is final.
-- One transaction that always ends in an error, so nothing is kept. Success: the error text is "ALL PASSED (rolled back)".
do $$
declare
  au uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); r4 uuid := gen_random_uuid();
  p_threat uuid; p_self uuid; p_mild uuid; p_ok uuid; p_ok2 uuid;
  x private.posts;
  r jsonb;
  bad text[] := '{}';
  n int := 80;
  u uuid;
begin
  foreach u in array array[au, r1, r2, r3, r4] loop
    n := n + 1;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2547120000' || n, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); set local role authenticated;
    r := public.register_member('Test Person', date '1995-05-05', null, 'Pen' || n, 'moon', array['English'], array[]::text[], 'v1');
    if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED %', r::text; end if;
    reset role;
  end loop;

  insert into private.posts (author_id, topic, title, body, status) values (au, 'Grief', 'A hard week', 'I will kill you if you post that again, I mean it.', 'published') returning id into p_threat;
  insert into private.posts (author_id, topic, title, body, status) values (au, 'Grief', 'Tonight is heavy', 'Some days I just want to die and nothing helps at all.', 'published') returning id into p_self;
  insert into private.posts (author_id, topic, title, body, status) values (au, 'Grief', 'Talking to someone', 'Honestly shut up about it already, you are tiring me out.', 'published') returning id into p_mild;
  insert into private.posts (author_id, topic, title, body, status) values (au, 'Grief', 'A good day', 'Went for a walk and felt a little lighter than last week.', 'published') returning id into p_ok;
  insert into private.posts (author_id, topic, title, body, status) values (au, 'Grief', 'Another good day', 'Made tea and called my sister, which helped more than I expected.', 'published') returning id into p_ok2;

  select * into x from private.posts where id = p_threat;
  if x.status <> 'pending' or x.publish_after is not null or x.held_reason <> 'Threat' or x.held_score < 0.8 then bad := bad || ('threat not held: ' || x::text); end if;
  select * into x from private.posts where id = p_self;
  if x.status <> 'published' then bad := bad || 'self-harm was held'; end if;
  if not exists (select 1 from private.reports where target_id = p_self and reason = 'self-harm') then bad := bad || 'self-harm case missing'; end if;
  select * into x from private.posts where id = p_mild;
  if x.status <> 'published' then bad := bad || 'mild score was held'; end if;
  if not exists (select 1 from private.reports where target_id = p_mild) then bad := bad || 'mild case missing'; end if;
  select * into x from private.posts where id = p_ok;
  if x.status <> 'published' then bad := bad || 'clean post held'; end if;

  -- a held post is not readable by another member
  if private.can_read_post(p_threat, r1) then bad := bad || 'held post readable'; end if;

  -- reports: two different members don't hold it, a third does; the same member twice counts once
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok, 'harassment', ''); r := public.report_post(p_ok, 'harassment', '');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok, 'scam', '');
  reset role;
  select * into x from private.posts where id = p_ok;
  if x.status <> 'published' then bad := bad || 'held after 2 reporters'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok, 'hate', '');
  reset role;
  select * into x from private.posts where id = p_ok;
  if x.status <> 'pending' or x.held_reason <> 'Reported by members' then bad := bad || ('not held after 3 reporters: ' || x::text); end if;

  -- self-harm reports never hold a post
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok2, 'self-harm', '');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok2, 'self-harm', '');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok2, 'self-harm', '');
  reset role;
  select * into x from private.posts where id = p_ok2;
  if x.status <> 'published' then bad := bad || 'held by self-harm reports'; end if;

  -- once a moderator has approved a post, more reports don't hold it again
  update private.posts set status = 'published', reviewed_at = now() where id = p_ok;
  perform set_config('request.jwt.claims', json_build_object('sub', r4, 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p_ok, 'harassment', '');
  reset role;
  select * into x from private.posts where id = p_ok;
  if x.status <> 'published' then bad := bad || 're-held after approval'; end if;

  -- the cases come worst first
  if (select (c->>'severity') from jsonb_array_elements(private.cases_json('admin')) c limit 1) <> (select min(c->>'severity') from jsonb_array_elements(private.cases_json('admin')) c) then bad := bad || 'cases not ordered by severity'; end if;

  if array_length(bad, 1) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
