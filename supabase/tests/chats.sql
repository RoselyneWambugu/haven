-- Chats and matching checks. One transaction that always ends in an error, so nothing is kept.
-- Success: the error text is "ALL CHAT CHECKS PASSED". Any other text lists what failed.
-- The first block compares the server's contact-details filter with the app's, case by case.
do $$
declare
  u text[] := array['254712000001','254712000002','254712000003','254712000004','254712000005','254712000006'];
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  names text[] := array['Wanjiru Kamau','Achieng Otieno','Brian Mutua','Halima Duale','Esther Njeri','Kiptoo Rotich'];
  dobs date[] := array[date '1995-05-05', date '1996-06-06', date '1986-03-03', date '1960-01-01', date '1994-04-04', date '1990-02-02'];
  pens text[] := array['QuietPine','RiverStone','GentleFern','SoftDune','BrightLeaf','CalmTide'];
  langs text[] := array['English','English,Kiswahili','English','Somali','English','English'];
  r jsonb;
  n int;
  conv uuid;
  conv2 uuid;
  chk text[];
  bad text[] := '{}';
  i int;
begin
  for i in 1..6 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
      values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u[i], now(), now());
  end loop;

  -- 1. The filter agrees with the app.
  chk := array(select unnest(private.blocked_reasons('hello, how was your day?'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('hello, how was your day?' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('call me on 0712 345 678'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('call me on 0712 345 678' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('my number is 0 7 1 2 3 4 5 6 7 8'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('my number is 0 7 1 2 3 4 5 6 7 8' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('zero seven one two three four five six seven eight'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('zero seven one two three four five six seven eight' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('o7 1 2 345 678'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('o7 1 2 345 678' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('sifuri saba moja mbili tatu nne tano sita saba nane'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('sifuri saba moja mbili tatu nne tano sita saba nane' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('text +254 712 345 678'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('text +254 712 345 678' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('I was born in 1998 and have 3 kids'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('I was born in 1998 and have 3 kids' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('it costs 5000 shillings, maybe 12000'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('it costs 5000 shillings, maybe 12000' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('check https://example.com'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['link']::text[] then bad := bad || ('check https://example.com' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('visit www.mysite.org today'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['link']::text[] then bad := bad || ('visit www.mysite.org today' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('go to mysite dot com'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['link']::text[] then bad := bad || ('go to mysite dot com' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('find me at wa.me/254712345678'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['link','phone']::text[] then bad := bad || ('find me at wa.me/254712345678' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('bit.ly/abc'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['link']::text[] then bad := bad || ('bit.ly/abc' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('I love tea.com is not a thing but tea.me/ is'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['link']::text[] then bad := bad || ('I love tea.com is not a thing but tea.me/ is' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('email me at jane@gmail.com'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['email','link']::text[] then bad := bad || ('email me at jane@gmail.com' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('jane at gmail dot com'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['email','link']::text[] then bad := bad || ('jane at gmail dot com' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('reach me jane (at) yahoo (dot) com'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['email','link']::text[] then bad := bad || ('reach me jane (at) yahoo (dot) com' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('add me on whatsapp'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['handle']::text[] then bad := bad || ('add me on whatsapp' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('my insta is quiet_pine'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['handle']::text[] then bad := bad || ('my insta is quiet_pine' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('follow @quietpine_01'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['handle']::text[] then bad := bad || ('follow @quietpine_01' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('telegram me'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('telegram me' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('I use whatsapp every day but never share'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('I use whatsapp every day but never share' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('I live at plot 45 near the school'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('I live at plot 45 near the school' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('P.O. Box 1234'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('P.O. Box 1234' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('house no 12'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('house no 12' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('14 Kenyatta Road'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('14 Kenyatta Road' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('my address is somewhere'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('my address is somewhere' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('behind the petrol station'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('behind the petrol station' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('opposite the big supermarket'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['address']::text[] then bad := bad || ('opposite the big supermarket' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('I feel anxious today and want to talk'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('I feel anxious today and want to talk' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('Let us meet at 7 pm'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('Let us meet at 7 pm' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('the answer is 42'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('the answer is 42' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('x.com is a site'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('x.com is a site' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('dm me'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('dm me' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('ping me on discord'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['handle']::text[] then bad := bad || ('ping me on discord' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('one two three'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from '{}'::text[] then bad := bad || ('one two three' || ' => ' || chk::text); end if;
  chk := array(select unnest(private.blocked_reasons('tel: 0722000111'))); chk := array(select x from unnest(chk) x order by x); if chk is distinct from array['phone']::text[] then bad := bad || ('tel: 0722000111' || ' => ' || chk::text); end if;
  if cardinality(bad) > 0 then raise exception 'FILTER DIFFERS: %', array_to_string(bad, ' | '); end if;

  -- 2. Register everyone.
  for i in 1..6 loop
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', ids[i], 'role', 'authenticated')::text, true);
    set local role authenticated;
    r := public.register_member(names[i], dobs[i], null, pens[i], 'moon', string_to_array(langs[i], ','), array[]::text[], 'v1');
    if r->>'ok' is distinct from 'true' then bad := bad || ('register ' || i || ': ' || r::text); end if;
  end loop;
  if cardinality(bad) > 0 then raise exception 'SETUP FAILED: %', array_to_string(bad, ' | '); end if;
  reset role;
  insert into private.subscriptions (account_id, plan_id, ends_at, method, receipt_no) select x, 'monthly', now() + interval '30 days', 'mpesa', 'T-1' from unnest(ids) x;

  -- 3. Two people with the same age range and a language are matched.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'searching' then bad := bad || ('A should wait: ' || r::text); end if;
  r := public.start_matching();
  if r->>'state' is distinct from 'searching' then bad := bad || ('A asking twice: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'found' then bad := bad || ('B should match A: ' || r::text); end if;
  conv := (r->>'conversation_id')::uuid;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.match_status();
  if r->>'state' is distinct from 'found' or (r->>'conversation_id')::uuid is distinct from conv then bad := bad || ('A should see the match: ' || r::text); end if;
  r := public.match_status();
  if r->>'state' is distinct from 'idle' then bad := bad || ('match is reported once: ' || r::text); end if;

  -- 4. Each sees the other's pen name and nothing else.
  r := public.my_chats();
  if r->'conversations'->0->'peer'->>'pen_name' is distinct from 'RiverStone' then bad := bad || ('A sees peer: ' || r::text); end if;
  if r->'conversations'->0->'peer' ? 'account_id' or r::text like '%254712%' or r::text like '%Otieno%' then bad := bad || 'A can see private details'; end if;
  r := public.send_message(conv, 'hello there');
  if r->>'ok' is distinct from 'true' then bad := bad || ('send: ' || r::text); end if;
  r := public.send_message(conv, 'call me on 0712 345 678');
  if r->>'code' is distinct from 'blocked' then bad := bad || ('phone not blocked: ' || r::text); end if;
  r := public.send_message(conv, '   ');
  if r->>'code' is distinct from 'empty' then bad := bad || ('empty: ' || r::text); end if;
  r := public.send_message(conv, repeat('a', 2001));
  if r->>'code' is distinct from 'too-long' then bad := bad || ('too long: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if (r->'conversations'->0->>'unread')::int < 1 or r->'conversations'->0->'messages'->-1->>'from' is distinct from 'them' then bad := bad || ('B sees A message: ' || r::text); end if;
  perform public.mark_read(conv);
  r := public.my_chats();
  if (r->'conversations'->0->>'unread')::int <> 0 then bad := bad || ('unread after read: ' || r::text); end if;

  -- 5. A third person sees nothing and can do nothing in that chat.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  select count(*) into n from public.conversations; if n <> 0 then bad := bad || 'C sees conversations'; end if;
  select count(*) into n from public.messages; if n <> 0 then bad := bad || 'C sees messages'; end if;
  select count(*) into n from public.conversation_members; if n <> 0 then bad := bad || 'C sees members'; end if;
  r := public.send_message(conv, 'hi');
  if r->>'code' is distinct from 'gone' then bad := bad || ('C could send: ' || r::text); end if;
  r := public.report_chat(conv, 'other', '');
  if r->>'code' is distinct from 'gone' then bad := bad || ('C could report: ' || r::text); end if;
  begin
    insert into public.messages (conversation_id, body) values (conv, 'forged');
    bad := bad || 'C wrote a message directly';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.match_queue;
    bad := bad || 'C read the queue';
  exception when insufficient_privilege then null; end;

  -- 6. The same two are not paired again soon, even after the chat ends.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.end_conversation(conv);
  r := public.send_message(conv, 'still there?');
  if r->>'code' is distinct from 'ended' then bad := bad || ('send after end: ' || r::text); end if;
  r := public.start_matching();
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'searching' then bad := bad || ('rematch too soon: ' || r::text); end if;
  perform public.cancel_matching();
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.cancel_matching();
  r := public.match_status();
  if r->>'state' is distinct from 'idle' then bad := bad || ('cancel: ' || r::text); end if;

  -- 7. A neighbouring age range is used when nobody fits exactly; no shared language means no match.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'searching' then bad := bad || ('C waits: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'searching' then bad := bad || ('D has nobody: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'state' is distinct from 'found' then bad := bad || ('E should match C by neighbouring age: ' || r::text); end if;
  conv2 := (r->>'conversation_id')::uuid;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.cancel_matching();

  -- 8. Blocking and reporting.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.send_message(conv2, 'first');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  perform public.send_message(conv2, 'you there');
  perform public.send_message(conv2, 'second');
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.block_peer(conv2, true);
  if r->>'ok' is distinct from 'true' then bad := bad || ('block: ' || r::text); end if;
  r := public.my_chats();
  if jsonb_array_length(r->'conversations') <> 0 then bad := bad || ('blocked chat still shown: ' || r::text); end if;
  if r->'blocked'->0->>'pen_name' is distinct from 'BrightLeaf' then bad := bad || ('blocked list: ' || r::text); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  if (r->'conversations'->0->>'ended')::boolean is distinct from true then bad := bad || ('other side sees end: ' || r::text); end if;
  reset role;
  select count(*) into n from private.reports where conversation_id = conv2 and reported = ids[5] and jsonb_array_length(snapshot) = 3;
  if n <> 1 then bad := bad || 'report snapshot missing'; end if;
  select count(*) into n from private.reports where conversation_id = conv2 and (snapshot->2->>'reported')::boolean and not (snapshot->0->>'reported')::boolean;
  if n <> 1 then bad := bad || 'reported lines wrong'; end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_chats();
  perform public.unblock_peer((r->'blocked'->0->>'id')::uuid);
  r := public.my_chats();
  if jsonb_array_length(r->'blocked') <> 0 then bad := bad || 'unblock'; end if;

  -- 9. Five chats at a time.
  reset role;
  for i in 1..5 loop
    insert into public.conversations (expires_at) values (now() + interval '5 hours') returning id into conv;
    insert into public.conversation_members (conversation_id, account_id) values (conv, ids[6]);
  end loop;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[6], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.start_matching();
  if r->>'code' is distinct from 'chat-limit' then bad := bad || ('limit: ' || r::text); end if;

  -- 10. Cleanup: an hour-before note once, then an expired chat is removed unless reported.
  reset role;
  update public.conversations set expires_at = now() + interval '30 minutes' where id = conv;
  perform private.sweep(); perform private.sweep();
  select count(*) into n from public.messages where conversation_id = conv and body like 'This chat ends in about an hour%'; if n <> 1 then bad := bad || format('hour note %s times', n); end if;
  update public.conversations set expires_at = now() - interval '1 minute' where id = conv;
  perform private.sweep();
  select count(*) into n from public.conversations where id = conv; if n <> 0 then bad := bad || 'expired chat kept'; end if;
  update public.conversations set expires_at = now() - interval '1 minute' where id = conv2;
  perform private.sweep();
  select count(*) into n from public.conversations where id = conv2 and retained_at is not null; if n <> 1 then bad := bad || 'reported chat not kept'; end if;
  select count(*) into n from public.conversation_members where conversation_id = conv2 and not hidden; if n <> 0 then bad := bad || 'reported chat still visible'; end if;

  -- 11. Signed-out visitors can do nothing.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.my_chats(); bad := bad || 'anon read chats'; exception when insufficient_privilege then null; end;
  begin perform public.start_matching(); bad := bad || 'anon matched'; exception when insufficient_privilege then null; end;

  reset role;
  if cardinality(bad) > 0 then raise exception 'CHAT FAILURES: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL CHAT CHECKS PASSED';
end $$;
