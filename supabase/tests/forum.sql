-- Forum and support spaces checks. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL FORUM CHECKS PASSED". Any other text lists what failed.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  phones text[] := array['254712000011','254712000012','254712000013'];
  names text[] := array['Wanjiru Kamau','Achieng Otieno','Brian Mutua'];
  dobs date[] := array[date '1995-05-05', date '1996-06-06', date '1986-03-03'];
  pens text[] := array['QuietPine','RiverStone','GentleFern'];
  r jsonb;
  n int;
  p1 uuid; p2 uuid; pc uuid; pp uuid; c1 uuid; c2 uuid;
  bad text[] := '{}';
  i int;
begin
  for i in 1..3 loop
    reset role;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
      values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', phones[i], now(), now());
    reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[i], 'role', 'authenticated')::text, true); set local role authenticated;
    r := public.register_member(names[i], dobs[i], null, pens[i], 'moon', array['English'], array[]::text[], 'v1');
    if r->>'ok' is distinct from 'true' then bad := bad || ('register ' || i || ': ' || r::text); end if;
  end loop;
  if cardinality(bad) > 0 then raise exception 'SETUP FAILED: %', array_to_string(bad, ' | '); end if;

  -- 1. A first post is checked before it goes live, and only its author sees it meanwhile.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('Grief', 'Lost my dad last month', 'I do not know how to explain it to people at work.');
  if r->>'ok' is distinct from 'true' or (r->>'pending')::boolean is distinct from true then bad := bad || ('first post pending: ' || r::text); end if;
  p1 := (r->>'post_id')::uuid;
  r := public.forum_feed();
  if jsonb_array_length(r->'posts') <> 1 or r->'posts'->0->>'status' <> 'pending' or (r->'posts'->0->>'mine')::boolean is not true then bad := bad || ('author sees pending: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.forum_feed();
  if jsonb_array_length(r->'posts') <> 0 then bad := bad || ('B sees pending: ' || r::text); end if;
  reset role;
  update private.posts set publish_after = now() - interval '1 second' where id = p1;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.forum_feed();
  if jsonb_array_length(r->'posts') <> 1 or r->'posts'->0->>'status' <> 'published' then bad := bad || ('B sees live post: ' || r::text); end if;
  if r->'posts'->0->>'author_name' <> 'QuietPine' or r->'posts'->0->>'author_key' = 'me' then bad := bad || ('author shown: ' || r::text); end if;
  if r::text like '%' || ids[1]::text || '%' or r::text like '%254712%' or r::text like '%Kamau%' then bad := bad || 'feed shows private details'; end if;

  -- 2. The second post goes straight up; the rules are checked.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('Wellbeing', 'Small win today', 'I went for a walk for the first time in weeks.');
  if r->>'ok' is distinct from 'true' or (r->>'pending')::boolean is not false then bad := bad || ('second post live: ' || r::text); end if;
  p2 := (r->>'post_id')::uuid;
  r := public.create_post('Wellbeing', 'Call me', 'my number is 0712 345 678 please call');
  if r->>'code' is distinct from 'blocked' then bad := bad || ('phone in post: ' || r::text); end if;
  r := public.create_post('Wellbeing', '   ', 'A long enough body for this post.');
  if r->>'code' is distinct from 'title' then bad := bad || ('title: ' || r::text); end if;
  r := public.create_post('Wellbeing', 'Short', 'too short');
  if r->>'code' is distinct from 'body' then bad := bad || ('body: ' || r::text); end if;
  r := public.create_post('Not a topic', 'A title', 'A long enough body for this post.');
  if r->>'code' is distinct from 'topic' then bad := bad || ('topic: ' || r::text); end if;

  -- 3. Comments and support.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.add_comment(p1, 'I am so sorry. You do not have to be strong here.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('comment: ' || r::text); end if;
  c1 := (r->>'comment_id')::uuid;
  r := public.add_comment(p1, 'write to me at jane@gmail.com');
  if r->>'code' is distinct from 'blocked' then bad := bad || ('email in comment: ' || r::text); end if;
  r := public.add_comment(p1, '   ');
  if r->>'code' is distinct from 'empty' then bad := bad || ('empty comment: ' || r::text); end if;
  r := public.toggle_support(p1);
  if (r->>'supported')::boolean is not true or (r->>'supports')::int <> 1 then bad := bad || ('support on: ' || r::text); end if;
  r := public.toggle_support(p1);
  if (r->>'supported')::boolean is not false or (r->>'supports')::int <> 0 then bad := bad || ('support off: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('Anxiety', 'First post nerves', 'This is my very first post here, be gentle.');
  pc := (r->>'post_id')::uuid;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.add_comment(pc, 'Welcome!');
  if r->>'code' is distinct from 'gone' then bad := bad || ('comment on someone else pending post: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.add_comment(pc, 'Commenting on my own pending post');
  if r->>'code' is distinct from 'pending' then bad := bad || ('own pending comment: ' || r::text); end if;

  -- 4. A sensitive space is checked, and readable only by those who joined.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('x', 'Trying a space', 'I have not joined this space yet.', 'ptsd');
  if r->>'code' is distinct from 'not-joined' then bad := bad || ('post without joining: ' || r::text); end if;
  r := public.join_space('ptsd');
  if r->>'ok' is distinct from 'true' then bad := bad || ('join: ' || r::text); end if;
  r := public.join_space('nowhere');
  if r->>'code' is distinct from 'space' then bad := bad || ('join unknown: ' || r::text); end if;
  r := public.create_post('x', 'Flashbacks at night', 'They come back when it is quiet.', 'ptsd');
  if (r->>'pending')::boolean is not true then bad := bad || ('space post pending even for a regular poster: ' || r::text); end if;
  pp := (r->>'post_id')::uuid;
  reset role;
  update private.posts set publish_after = now() - interval '1 second' where id = pp;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.forum_feed();
  if exists (select 1 from jsonb_array_elements(r->'posts') x where x->>'space' = 'ptsd') then bad := bad || 'non-member sees sensitive space'; end if;
  perform public.join_space('ptsd');
  r := public.forum_feed();
  if not exists (select 1 from jsonb_array_elements(r->'posts') x where x->>'space' = 'ptsd') then bad := bad || 'member cannot see sensitive space'; end if;
  perform public.leave_space('ptsd');
  r := public.forum_feed();
  if exists (select 1 from jsonb_array_elements(r->'posts') x where x->>'space' = 'ptsd') then bad := bad || 'leaver still sees sensitive space'; end if;
  r := public.add_comment(pp, 'trying after leaving');
  if r->>'code' is distinct from 'gone' then bad := bad || ('comment after leaving: ' || r::text); end if;
  r := public.report_post(pp, 'other', '');
  if r->>'code' is distinct from 'gone' then bad := bad || ('report unreadable post: ' || r::text); end if;

  -- 5. Editing is for the author, for 15 minutes.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.edit_post(p2, 'Small win today!', 'I went for a walk for the first time in weeks, and it felt good.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('edit: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.edit_post(p2, 'Hijacked', 'Someone else is editing this post now.');
  if r->>'code' is distinct from 'gone' then bad := bad || ('edit other: ' || r::text); end if;
  reset role;
  update private.posts set created_at = now() - interval '20 minutes' where id = p2;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.edit_post(p2, 'Too late', 'This edit comes after the fifteen minutes are up.');
  if r->>'code' is distinct from 'window' then bad := bad || ('edit window: ' || r::text); end if;

  -- 6. Reports keep what was said, as it was.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_post(p2, 'other', 'x');
  if r->>'ok' is distinct from 'true' then bad := bad || ('report post: ' || r::text); end if;
  r := public.report_post(p2, 'nonsense', '');
  if r->>'code' is distinct from 'invalid' then bad := bad || ('report reason: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.add_comment(p1, 'Thank you for sharing this.');
  c2 := (r->>'comment_id')::uuid;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.report_comment(c2, 'harassment', '');
  if r->>'ok' is distinct from 'true' then bad := bad || ('report comment: ' || r::text); end if;
  r := public.report_post(p2, 'other', '');
  if r->>'code' is distinct from 'own' then bad := bad || ('report own: ' || r::text); end if;
  reset role;
  select count(*) into n from private.reports where target = 'post' and target_id = p2 and jsonb_array_length(snapshot) = 1;
  if n <> 1 then bad := bad || 'post report snapshot'; end if;
  select count(*) into n from private.reports where target = 'comment' and target_id = c2 and jsonb_array_length(snapshot) = 3 and (snapshot->2->>'reported')::boolean;
  if n <> 1 then bad := bad || 'comment report snapshot'; end if;

  -- 7. A post can be taken down by its author, with its comments.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.remove_post(p1);
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.forum_feed();
  if exists (select 1 from jsonb_array_elements(r->'posts') x where x->>'id' = p1::text) then bad := bad || 'removed post still shown'; end if;
  reset role;
  select count(*) into n from private.comments where post_id = p1; if n <> 0 then bad := bad || 'comments of a removed post kept'; end if;

  -- 8. Too many posts in an hour.
  insert into private.posts (author_id, topic, title, body) select ids[3], 'Wellbeing', 'filler ' || g, 'filler body for the rate check' from generate_series(1, 10) g;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_post('Wellbeing', 'One more', 'This one should be turned away for now.');
  if r->>'code' is distinct from 'rate' then bad := bad || ('post rate: ' || r::text); end if;

  -- 9. Nothing is readable directly, and signed-out visitors can do nothing.
  begin
    perform 1 from private.posts;
    bad := bad || 'member read posts directly';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.forum_feed(); bad := bad || 'anon read the feed'; exception when insufficient_privilege then null; end;
  begin perform public.create_post('Grief', 'x', 'a long enough body here'); bad := bad || 'anon posted'; exception when insufficient_privilege then null; end;

  reset role;
  if cardinality(bad) > 0 then raise exception 'FORUM FAILURES: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL FORUM CHECKS PASSED';
end $$;
