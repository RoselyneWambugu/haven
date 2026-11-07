-- Watch likes, dislikes and comments. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL PASSED (rolled back)". Any other text lists what failed.
do $$
declare
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); fr uuid := gen_random_uuid(); m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); ad uuid := gen_random_uuid();
  eid uuid := gen_random_uuid(); draft uuid := gen_random_uuid();
  cid uuid; cid2 uuid; nid uuid;
  r jsonb; bad text[] := '{}'; n int := 40; u uuid; k int;
begin
  foreach u in array array[p1, p2, fr, m1, m2, ad] loop
    n := n + 1;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2547120000' || n, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
    r := public.register_member('Test Person', date '1995-05-05', null, 'Pen' || n, 'moon', array['English'], array[]::text[], 'v1');
    reset role;
  end loop;
  insert into private.staff (account_id, name, role, heavy) values (m1, 'M. One', 'moderator', false), (m2, 'M. Two', 'moderator', false), (ad, 'A. Admin', 'admin', false);
  insert into private.subscriptions (account_id, plan_id, ends_at, auto_renew, method, receipt_no) values (p1, 'monthly', now() + interval '10 days', false, 'mpesa', 'T-R1'), (p2, 'monthly', now() + interval '10 days', false, 'mpesa', 'T-R2');
  insert into private.episodes (id, title, blurb, video_path, status, published_at, created_by) values
    (eid, 'Red table, week one', 'A first conversation about talking to people we love.', 'v/' || eid || '/video.mp4', 'published', now(), 'A. Admin'),
    (draft, 'Red table, a draft', 'A draft conversation that members must not see yet.', 'v/' || draft || '/video.mp4', 'draft', null, 'A. Admin');

  -- reactions
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_react(eid, 1);
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('free liked: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_react(eid, 1);
  if r->>'ok' is distinct from 'true' or (r->>'likes')::int <> 1 or (r->>'my_reaction')::int <> 1 then bad := bad || ('like: ' || r::text); end if;
  r := public.episode_react(eid, 5);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('bad value: ' || r::text); end if;
  r := public.episode_react(draft, 1);
  if r->>'code' is distinct from 'gone' then bad := bad || ('draft liked: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_react(eid, -1);
  if r->>'ok' is distinct from 'true' or (r->>'likes')::int <> 1 or (r->>'my_reaction')::int <> -1 then bad := bad || ('dislike: ' || r::text); end if;
  r := public.episodes_list();
  if (r->'episodes'->0->>'likes')::int <> 1 or (r->'episodes'->0->>'my_reaction')::int <> -1 then bad := bad || ('list counts: ' || r::text); end if;
  if r::text like '%dislike%' then bad := bad || 'members can see dislikes'; end if;
  r := public.episode_react(eid, 1);
  r := public.episode_react(eid, 0);
  if (r->>'likes')::int <> 1 or (r->>'my_reaction')::int <> 0 then bad := bad || ('clear: ' || r::text); end if;
  reset role;

  -- staff see the dislikes
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_episodes();
  if (r->'episodes'->1->>'likes') is null then bad := bad || ('admin list: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_react(eid, -1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_episodes();
  select coalesce(max((e->>'dislikes')::int), 0) into k from jsonb_array_elements(r->'episodes') e;
  if k <> 1 then bad := bad || ('staff dislikes ' || k); end if;
  reset role;

  -- comments
  perform set_config('request.jwt.claims', json_build_object('sub', fr, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_comment_add(eid, 'A kind thought for everyone watching.');
  if r->>'code' is distinct from 'needs-plan' then bad := bad || ('free commented: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_comment_add(eid, '   ');
  if r->>'code' is distinct from 'empty' then bad := bad || ('empty: ' || r::text); end if;
  r := public.episode_comment_add(eid, 'Call me on 0712345678 and we can talk.');
  if r->>'code' is distinct from 'blocked' then bad := bad || ('phone number: ' || r::text); end if;
  r := public.episode_comment_add(draft, 'A kind thought for everyone watching.');
  if r->>'code' is distinct from 'gone' then bad := bad || ('draft comment: ' || r::text); end if;
  r := public.episode_comment_add(eid, 'A kind thought for everyone watching.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('comment: ' || r::text); end if;
  cid := (r->>'comment_id')::uuid;
  r := public.episode_comment_add(eid, 'I will kill you if you say that again, I mean it.');
  cid2 := (r->>'comment_id')::uuid;
  r := public.episode_comments(eid);
  if jsonb_array_length(r->'comments') <> 2 or r->'comments'->0->>'author_key' <> 'me' or (r->'comments'->0->>'mine')::boolean is not true then bad := bad || ('list comments: ' || r::text); end if;
  reset role;
  if not exists (select 1 from private.reports where target_id = cid2) then bad := bad || 'the scanner did not flag the threat'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episodes_list();
  if (r->'episodes'->0->>'comments')::int <> 2 then bad := bad || ('comment count: ' || r::text); end if;
  r := public.episode_comments(eid);
  if r->'comments'->0->>'author_key' = 'me' then bad := bad || 'someone else’s comment marked mine'; end if;
  r := public.episode_comment_report(cid, 'harassment', '');
  if r->>'ok' is distinct from 'true' then bad := bad || ('report: ' || r::text); end if;
  r := public.episode_comment_remove_own(cid);
  if r->>'code' is distinct from 'gone' then bad := bad || ('removed someone else’s: ' || r::text); end if;
  reset role;

  -- a moderator removes it from the case, the author is told, an appeal by another moderator puts it back
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_remove_comment(cid, 'Unkind to another member');
  if r->>'ok' is distinct from 'true' then bad := bad || ('mod remove: ' || r::text); end if;
  reset role;
  if not exists (select 1 from private.episode_comments where id = cid and hidden_at is not null) then bad := bad || 'not hidden'; end if;
  select id into nid from private.notices where account_id = p1 and target_id = cid;
  if nid is null then bad := bad || 'no notice'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.appeal_notice(nid, 'This was meant kindly and I think it was misread by someone');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_decide_appeal(nid, 'overturned', 'Read again, it is fine to stay.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('overturn: ' || r::text); end if;
  reset role;
  if exists (select 1 from private.episode_comments where id = cid and hidden_at is not null) then bad := bad || 'not restored'; end if;

  -- an author removes their own
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.episode_comment_remove_own(cid);
  if r->>'ok' is distinct from 'true' then bad := bad || ('own remove: ' || r::text); end if;
  r := public.episode_comments(eid);
  if jsonb_array_length(r->'comments') <> 1 then bad := bad || ('after own remove: ' || r::text); end if;
  reset role;

  if array_length(bad, 1) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
