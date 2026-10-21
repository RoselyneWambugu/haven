-- Therapist portal checks. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL PORTAL CHECKS PASSED". Any other text lists what failed.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid()];
  phones text[] := array['254712000051','254712000052'];
  r jsonb;
  n int;
  s1 timestamptz; sa timestamptz; sfar timestamptz; sfar2 timestamptz;
  o uuid; sess1 uuid; sess2 uuid; conv uuid; post uuid; fakesess uuid;
  bad text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values
    (ids[1], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', phones[1], now(), now()),
    (ids[2], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', phones[2], now(), now());
  update private.therapists set account_id = ids[1] where id = 't-amina';
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Achieng Otieno', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;
  reset role;
  insert into private.payment_test_phones (phone) values ('+254712000052');
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) values (ids[2], 'monthly', now() + interval '30 days', 'mpesa', 'T-1');
  select d into s1 from generate_series(date_trunc('hour', now()) + interval '3 hours', now() + interval '10 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) order by d limit 1;
  select d into sa from generate_series(s1 + interval '1 day', now() + interval '12 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) and private.slot_ok('t-amina', 'chat', d + interval '1 hour') order by d limit 1;
  select d into sfar from generate_series(sa + interval '2 days', now() + interval '14 days', interval '15 minutes') d where private.slot_ok('t-amina', 'chat', d) order by d limit 1;
  if s1 is null or sa is null or sfar is null then raise exception 'NOT ENOUGH SLOTS: % % %', s1, sa, sfar; end if;

  -- A member books and pays for a chat session.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_session_checkout('t-amina', 'chat', s1);
  r := public.simulate_payment((r->>'order_id')::uuid, 'mpesa', 'success');
  sess1 := (r->>'session_id')::uuid;
  if sess1 is null then raise exception 'BOOKING FAILED: %', r; end if;

  -- 1. Only a linked therapist gets the portal.
  r := public.my_portal();
  if r->>'code' is distinct from 'not-therapist' then bad := bad || ('member in portal: ' || r::text); end if;
  r := public.portal_send(gen_random_uuid(), 'hi');
  if r->>'code' is distinct from 'not-therapist' then bad := bad || ('member sending as therapist: ' || r::text); end if;

  -- 2. What the therapist sees: a pen name and an avatar, never who the client is.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_portal();
  if r->>'ok' is distinct from 'true' or r->>'therapist_id' <> 't-amina' then bad := bad || ('my_portal: ' || r::text); end if;
  if jsonb_array_length(r->'sessions') <> 1 or r->'sessions'->0->>'client_name' <> 'QuietPine' or r->'sessions'->0->>'status' <> 'booked' then bad := bad || ('portal sessions: ' || r::text); end if;
  if jsonb_array_length(r->'threads') <> 1 or r->'threads'->0->>'client_name' <> 'QuietPine' then bad := bad || ('portal threads: ' || r::text); end if;
  if r::text like '%254712%' or r::text like '%Achieng%' or r::text like '%1996%' then bad := bad || 'portal shows who the client is'; end if;
  conv := (r->'threads'->0->>'id')::uuid;

  -- 3. The therapist and the member talk.
  r := public.portal_send(conv, 'Hello, welcome. How have you been sleeping?');
  if r->>'ok' is distinct from 'true' then bad := bad || ('therapist send: ' || r::text); end if;
  r := public.portal_send(conv, 'call me on 0712 345 678');
  if r->>'code' is distinct from 'blocked' then bad := bad || ('therapist phone number: ' || r::text); end if;
  r := public.portal_send(conv, '   ');
  if r->>'code' is distinct from 'empty' then bad := bad || ('therapist empty: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if r->'conversations'->0->'messages'->-1->>'from' is distinct from 'them' or r->'conversations'->0->'messages'->-1->>'text' not like 'Hello, welcome%' then bad := bad || ('member sees therapist: ' || r::text); end if;
  if r->'conversations'->0->'peer' is distinct from 'null'::jsonb then bad := bad || 'member sees a peer on a therapist chat'; end if;
  r := public.send_message(conv, 'Better this week, thank you.');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_portal();
  if (r->'threads'->0->>'unread')::int < 1 or r->'threads'->0->'messages'->-1->>'from' is distinct from 'them' then bad := bad || ('therapist sees reply: ' || r::text); end if;
  perform public.mark_read(conv);
  r := public.my_portal();
  if (r->'threads'->0->>'unread')::int <> 0 then bad := bad || ('thread still unread: ' || r::text); end if;
  r := public.portal_offer_time(conv, sa);
  if r->>'ok' is distinct from 'true' then bad := bad || ('offer a time: ' || r::text); end if;

  -- 4. Joining, notes and wrapping up.
  r := public.portal_join_session(sess1);
  if r->>'code' is distinct from 'early' then bad := bad || ('join early: ' || r::text); end if;
  reset role;
  update private.sessions set start_at = now() + interval '5 minutes', end_at = now() + interval '50 minutes' where id = sess1;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_join_session(sess1);
  if r->>'ok' is distinct from 'true' then bad := bad || ('join: ' || r::text); end if;
  r := public.portal_set_note(sess1, 'Sleep is better; still worried about exams.');
  r := public.my_portal();
  if r->'sessions'->0->>'status' <> 'in-progress' or r->'sessions'->0->>'note' not like 'Sleep is better%' then bad := bad || ('in progress: ' || r::text); end if;
  r := public.portal_wrap_up(sess1, 'someone', 'x', null);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('bad attendance: ' || r::text); end if;
  r := public.portal_wrap_up(sess1, 'attended', 'Discussed sleep and routine.', now() + interval '7 days');
  if r->>'ok' is distinct from 'true' then bad := bad || ('wrap up: ' || r::text); end if;
  r := public.my_portal();
  if r->'sessions'->0->>'status' <> 'completed' or r->'sessions'->0->>'attendance' <> 'attended' or (r->'sessions'->0->>'gross_kes')::int <> 1500 or r->'sessions'->0->>'follow_up' is null then bad := bad || ('after wrap up: ' || r::text); end if;
  r := public.portal_wrap_up(sess1, 'attended', 'again', null);
  if r->>'code' is distinct from 'gone' then bad := bad || ('wrap up twice: ' || r::text); end if;
  r := public.portal_join_session(sess1);
  if r->>'code' is distinct from 'done' then bad := bad || ('join a finished session: ' || r::text); end if;
  reset role;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at, price_kes) values (ids[2], 't-amina', 'chat', now() - interval '1 hour', now() - interval '15 minutes', 1500) returning id into sess2;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_wrap_up(sess2, 'no-show', '', null);
  r := public.my_portal();
  if not exists (select 1 from jsonb_array_elements(r->'sessions') x where x->>'id' = sess2::text and x->>'attendance' = 'no-show' and x->'gross_kes' = 'null'::jsonb and x->>'status' = 'completed') then bad := bad || ('no-show is not paid: ' || r::text); end if;

  -- 5. Pausing, daily limit, buffer.
  r := public.portal_set_paused(true);
  reset role;
  if private.slot_ok('t-amina', 'chat', sa) then bad := bad || 'paused therapist can be booked'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.therapist_directory();
  if (select (x->>'accepting_new')::boolean from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina') then bad := bad || 'paused therapist shown as accepting'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.portal_set_paused(false);
  r := public.portal_set_caps(11, null, null);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('caps out of range: ' || r::text); end if;
  reset role;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at) values (ids[2], 't-amina', 'chat', sa, sa + interval '45 minutes');
  if not private.slot_ok('t-amina', 'chat', sa + interval '1 hour') then bad := bad || 'next hour should be bookable with the default buffer'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.portal_set_caps(null, 30, null);
  reset role;
  if private.slot_ok('t-amina', 'chat', sa + interval '1 hour') then bad := bad || 'buffer ignored'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.portal_set_caps(null, 15, 1);
  perform public.portal_set_caps(1, null, null);
  reset role;
  if private.slot_ok('t-amina', 'chat', sa + interval '1 hour') then bad := bad || 'daily limit ignored'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.portal_set_caps(5, null, null);

  -- 6. Time off tells the clients who are affected.
  r := public.portal_add_time_off(sa - interval '1 hour', sa + interval '2 hours');
  if r->>'ok' is distinct from 'true' or (r->>'notified')::int <> 1 then bad := bad || ('time off: ' || r::text); end if;
  r := public.portal_add_time_off(sa, sa - interval '1 hour');
  if r->>'code' is distinct from 'invalid' then bad := bad || ('time off backwards: ' || r::text); end if;
  reset role;
  if private.slot_ok('t-amina', 'chat', sa + interval '1 hour') then bad := bad || 'time off ignored'; end if;
  select count(*) into n from public.messages where conversation_id = conv and body like '%will be away at the time of your session%'; if n <> 1 then bad := bad || 'client not told about time off'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_portal();
  perform public.portal_remove_time_off((r->'time_off'->0->>'id')::uuid);
  r := public.my_portal();
  if jsonb_array_length(r->'time_off') <> 0 then bad := bad || 'time off not removed'; end if;

  -- 7. Weekly hours.
  r := public.portal_save_availability('[{"dow":1,"start":"13:00","end":"15:00","modes":["chat"]}]'::jsonb);
  if r->>'ok' is distinct from 'true' then bad := bad || ('save hours: ' || r::text); end if;
  r := public.my_portal();
  if jsonb_array_length(r->'availability') <> 1 then bad := bad || ('hours replaced: ' || r::text); end if;
  r := public.portal_save_availability('[{"dow":9,"start":"13:00","end":"15:00","modes":["chat"]}]'::jsonb);
  if r->>'code' is distinct from 'invalid' then bad := bad || ('bad hours: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.therapist_directory();
  if (select jsonb_array_length(x->'availability') from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina') <> 1 then bad := bad || 'directory still shows old hours'; end if;

  -- 8. The public profile.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_save_profile('Short', array['Grief'], array['English'], array['chat']);
  if r->>'code' is distinct from 'bio' then bad := bad || ('short bio: ' || r::text); end if;
  r := public.portal_save_profile('Reach me on jane@gmail.com for sessions outside Echo.', array['Grief'], array['English'], array['chat']);
  if r->>'code' is distinct from 'blocked' then bad := bad || ('bio with email: ' || r::text); end if;
  r := public.portal_save_profile('I help people with grief. Book a session with me for private therapy.', array['Grief'], array['English'], array['chat']);
  if r->>'code' is distinct from 'solicit' then bad := bad || ('bio soliciting: ' || r::text); end if;
  r := public.portal_save_profile('I help people feel heard and work on coping skills for grief and loss.', array[]::text[], array['English'], array['chat']);
  if r->>'code' is distinct from 'spec' then bad := bad || ('no specialisation: ' || r::text); end if;
  r := public.portal_save_profile('I help people feel heard and work on coping skills for grief and loss.', array['Grief'], array['English'], array['chat','voice']);
  if r->>'ok' is distinct from 'true' then bad := bad || ('save profile: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.therapist_directory();
  if not exists (select 1 from jsonb_array_elements(r->'therapists') x where x->>'id' = 't-amina' and x->>'bio' like 'I help people feel heard and work on coping%') then bad := bad || 'directory bio not updated'; end if;

  -- 9. The forum: a therapist reads without a plan and replies in their own name.
  r := public.create_post('Grief', 'Lost my dad last month', 'I do not know how to explain it to people at work.');
  post := (r->>'post_id')::uuid;
  reset role;
  update private.posts set publish_after = now() - interval '1 second' where id = post;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.forum_feed();
  if r->>'ok' is distinct from 'true' or not exists (select 1 from jsonb_array_elements(r->'posts') x where x->>'id' = post::text) then bad := bad || ('therapist reads the community: ' || r::text); end if;
  r := public.portal_forum_reply(post, 'short');
  if r->>'code' is distinct from 'short' then bad := bad || ('short reply: ' || r::text); end if;
  r := public.portal_forum_reply(post, 'You can book a session with me for private therapy anytime.');
  if r->>'code' is distinct from 'solicit' then bad := bad || ('soliciting reply: ' || r::text); end if;
  r := public.portal_forum_reply(post, 'Grief often comes in waves. Saying you are grieving is enough at work. This is general information, not treatment.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('therapist reply: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.forum_feed();
  if not exists (select 1 from jsonb_array_elements(r->'posts') p, jsonb_array_elements(p->'comments') c where p->>'id' = post::text and c->>'therapist_name' = 'Dr. Amina Otieno' and c->>'author_avatar' = 'leaf') then bad := bad || ('member sees therapist reply: ' || r::text); end if;
  if r::text like '%' || ids[1]::text || '%' then bad := bad || 'feed shows the therapist account id'; end if;

  -- 10. Concerns about a client.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_raise_concern(sess1, true, 'self-harm', 'The client spoke about hurting themselves.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('raise concern: ' || r::text); end if;
  r := public.portal_raise_concern(null, false, 'nonsense', '');
  if r->>'code' is distinct from 'invalid' then bad := bad || ('concern type: ' || r::text); end if;
  r := public.portal_raise_concern(gen_random_uuid(), false, 'behaviour', '');
  if r->>'code' is distinct from 'gone' then bad := bad || ('concern about someone else session: ' || r::text); end if;
  r := public.my_portal();
  if jsonb_array_length(r->'concerns') <> 1 or (r->'concerns'->0->>'danger')::boolean is not true then bad := bad || ('concerns list: ' || r::text); end if;

  -- 11. Changing where money goes needs a fresh sign-in.
  r := public.portal_change_payout('M-Pesa 0722 111 114', 'monthly');
  if r->>'code' is distinct from 'reauth' then bad := bad || ('payout without a fresh sign-in: ' || r::text); end if;
  reset role;
  update auth.users set last_sign_in_at = now() where id = ids[1];
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.portal_change_payout('M-Pesa 0722 111 114', 'monthly');
  if r->>'ok' is distinct from 'true' then bad := bad || ('payout: ' || r::text); end if;
  r := public.my_portal();
  if r->'payout'->>'schedule' <> 'monthly' then bad := bad || ('payout saved: ' || r::text); end if;

  -- 12. Closing a thread.
  r := public.portal_close_thread(conv);
  r := public.portal_send(conv, 'One more thing.');
  if r->>'code' is distinct from 'closed' then bad := bad || ('send after closing: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.send_message(conv, 'Thanks again.');
  if r->>'code' is distinct from 'ended' then bad := bad || ('member send after closing: ' || r::text); end if;

  -- 13. Privacy and limits.
  reset role;
  insert into private.sessions (member_id, therapist_id, mode, start_at, end_at) values (ids[2], 't-james', 'chat', sfar, sfar + interval '45 minutes');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_portal();
  if exists (select 1 from jsonb_array_elements(r->'sessions') x where x->>'start' = (extract(epoch from sfar) * 1000)::bigint::text) then bad := bad || 'therapist sees another therapist session'; end if;
  begin perform 1 from private.sessions; bad := bad || 'therapist read sessions directly'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.concerns; bad := bad || 'therapist read concerns directly'; exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.my_portal(); bad := bad || 'anon read the portal'; exception when insufficient_privilege then null; end;
  begin perform public.portal_send(conv, 'hi'); bad := bad || 'anon sent as therapist'; exception when insufficient_privilege then null; end;

  reset role;
  if cardinality(bad) > 0 then raise exception 'PORTAL FAILURES: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PORTAL CHECKS PASSED';
end $$;
