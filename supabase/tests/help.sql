-- Help content and tickets checks. Always rolls back.
do $$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  r jsonb; bad text[] := '{}'; tid uuid; tid2 uuid; n int; aid text; lid text; sg text;
begin
  for i in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '25471200015' || i, now(), now());
  end loop;
  -- 1 admin, 2 moderator, 3 clinical, 4 billing, 5 member
  insert into private.staff (account_id, name, role) values (ids[1], 'A. Admin', 'admin'), (ids[2], 'M. Mod', 'moderator'), (ids[3], 'C. Clin', 'clinical'), (ids[4], 'B. Bill', 'billing');
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.register_member('Help Member', date '1996-06-06', null, 'QuietPine', 'moon', array['English'], array[]::text[], 'v1');
  if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED: %', r; end if;

  -- Anyone can read the published help, signed in or not.
  reset role; set local role anon;
  r := public.help_content();
  if jsonb_array_length(r->'departments') < 9 or jsonb_array_length(r->'articles') < 19 or jsonb_array_length(r->'crisisLines') < 2 or r->'emergency'->>'phone' <> '112' then bad := array_append(bad, ('help_content: ' || left(r::text, 200))); end if;
  reset role;

  -- Tickets: validation, limits, reply, read, resolve.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_ticket('billing', '', 'I was charged twice yesterday', false);
  if r->>'code' is distinct from 'subject' then bad := array_append(bad, 'empty subject'); end if;
  r := public.create_ticket('billing', 'Charged twice', 'short', false);
  if r->>'code' is distinct from 'text' then bad := array_append(bad, 'short text'); end if;
  r := public.create_ticket('nowhere', 'Charged twice', 'I was charged twice yesterday', false);
  if r->>'code' is distinct from 'dept' then bad := array_append(bad, 'unknown department'); end if;
  r := public.create_ticket('billing', 'Charged twice', 'I was charged twice yesterday', false);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('create: ' || r::text)); end if;
  tid := (r->>'id')::uuid;
  r := public.create_ticket('safety', 'I need someone', 'I feel like I cannot go on any more', true);
  tid2 := (r->>'id')::uuid;
  if (r->>'crisis')::boolean is distinct from true then bad := array_append(bad, 'crisis flag'); end if;
  r := public.my_tickets();
  if jsonb_array_length(r->'tickets') <> 2 or jsonb_array_length(r->'tickets'->0->'messages') <> 1 then bad := array_append(bad, ('my_tickets: ' || r::text)); end if;
  for i in 1..3 loop r := public.create_ticket('tech', 'Slow ' || i, 'The app is slow on this screen', false); end loop;
  r := public.create_ticket('tech', 'Slow again', 'The app is slow on this screen', false);
  if r->>'code' is distinct from 'limit' then bad := array_append(bad, 'ticket limit'); end if;

  -- Staff only see their own departments' tickets.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_help();
  if jsonb_array_length(r->'tickets') <> 1 or r->'tickets'->0->>'deptId' <> 'safety' or (r->'tickets'->0->>'routedToCrisis')::boolean is not true then bad := array_append(bad, ('moderator tickets: ' || (r->'tickets')::text)); end if;
  r := public.admin_reply_ticket(tid, 'We will look into your billing.');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator answered billing'); end if;
  r := public.admin_reply_ticket(tid2, 'ok');
  if r->>'code' is distinct from 'empty' then bad := array_append(bad, 'short staff reply'); end if;
  r := public.admin_reply_ticket(tid2, 'We are here. A person will call you shortly.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('moderator reply: ' || r::text)); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_help();
  if not exists (select 1 from jsonb_array_elements(r->'tickets') t where t->>'id' = tid::text) then bad := array_append(bad, 'billing cannot see billing ticket'); end if;
  r := public.admin_reply_ticket(tid, 'We checked: you were charged twice and we will refund.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('billing reply: ' || r::text)); end if;

  -- The member sees the reply, marks it read, replies and resolves.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.my_tickets();
  if not exists (select 1 from jsonb_array_elements(r->'tickets') t where t->>'id' = tid::text and t->>'status' = 'replied' and (t->>'unread')::boolean and jsonb_array_length(t->'messages') = 2) then bad := array_append(bad, 'member does not see staff reply'); end if;
  r := public.mark_ticket_read(tid);
  r := public.reply_ticket(tid, 'Thank you, that is right.');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'member reply'); end if;
  r := public.resolve_ticket(tid);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'member resolve'); end if;
  -- Nobody reads another member's tickets.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.reply_ticket(tid2, 'I am not the owner');
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'replied to another members ticket'); end if;

  -- Editing the content: articles.
  r := public.admin_save_article(null, 'billing', 'Short', 'A fine introduction here', '["Do the first thing here"]'::jsonb, true);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short title accepted'); end if;
  r := public.admin_save_article(null, 'billing', 'How do I get a receipt?', 'Receipts are sent after each payment.', '["Open Me, then My plan.", "Choose Receipts."]'::jsonb, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('save article: ' || r::text)); end if;
  aid := r->>'id';
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_published(aid, false);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator unpublished a billing article'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[4], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_published(aid, false);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'billing unpublish'); end if;
  reset role; set local role anon;
  r := public.help_content();
  if exists (select 1 from jsonb_array_elements(r->'articles') a where a->>'id' = aid) then bad := array_append(bad, 'unpublished article still public'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_set_published(aid, true);
  set local role anon; r := public.help_content(); reset role;
  if not exists (select 1 from jsonb_array_elements(r->'articles') a where a->>'id' = aid) then bad := array_append(bad, 'published article not public'); end if;

  -- Departments: Admin only; Safety can't be switched off; a switched-off department hides its articles.
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_save_department('safety', null, null, null, null, false);
  if r->>'code' is distinct from 'locked' then bad := array_append(bad, 'safety switched off'); end if;
  r := public.admin_save_department('billing', null, null, null, 500, null);
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'sla range'); end if;
  r := public.admin_save_department('feedback', null, null, null, null, false);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'switch off feedback'); end if;
  r := public.create_ticket('feedback', 'Idea', 'I have an idea to improve the app', false);
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.create_ticket('feedback', 'Idea', 'I have an idea to improve the app', false);
  if r->>'code' is distinct from 'dept' then bad := array_append(bad, 'ticket to a disabled department'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_save_department('billing', 'Billing', null, null, null, null);
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator changed a department'); end if;

  -- Crisis lines and the directory: clinical and Admin only. Editing clears the "checked" mark; blank numbers can't be confirmed.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[2], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_save_crisis_line(null, 'Kenya Red Cross line', '1199', 'Free, 24 hours', 'English');
  if r->>'code' is distinct from 'role' then bad := array_append(bad, 'moderator edited a crisis line'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_mark_verified();
  if r->>'code' is distinct from 'blank' then bad := array_append(bad, ('verified with blanks: ' || r::text)); end if;
  r := public.admin_save_crisis_line('cl1', 'Kenya Red Cross line', '1199', 'Free, 24 hours', 'English and Kiswahili');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('save line: ' || r::text)); end if;
  r := public.admin_save_crisis_line('cl2', 'Helpline', 'abc', 'Free', 'English');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'bad phone'); end if;
  r := public.admin_save_crisis_line('cl2', 'Healthcare helpline', '+254 700 000 000', 'Free, 8am to 10pm', 'English');
  r := public.admin_mark_verified();
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('verify: ' || r::text)); end if;
  if (public.admin_help()->>'crisisVerifiedAt') is null then bad := array_append(bad, 'verified date missing'); end if;
  r := public.admin_save_crisis_line('cl2', 'Healthcare helpline', '+254 700 000 001', 'Free, 8am to 10pm', 'English');
  if (public.admin_help()->>'crisisVerifiedAt') is not null then bad := array_append(bad, 'edit did not clear the checked mark'); end if;
  r := public.admin_remove_crisis_line('cl2');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'remove line'); end if;
  set local role anon; r := public.help_content(); reset role;
  if jsonb_array_length(r->'crisisLines') <> 1 then bad := array_append(bad, 'removed line still public'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_save_org('o1', 'Aga Khan counselling', 'Counselling', 'Free', 'Mon to Fri', 'English', 'call', '0700000000');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('save org: ' || r::text)); end if;
  r := public.admin_archive_org('o3', true);
  set local role anon; r := public.help_content(); reset role;
  if jsonb_array_length(r->'supportOrgs') <> 2 then bad := array_append(bad, ('orgs public: ' || jsonb_array_length(r->'supportOrgs'))); end if;

  -- Suggestions from members go to the clinical team; accepted ones join the directory hidden.
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[5], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.suggest_service('x', '');
  if r->>'code' is distinct from 'invalid' then bad := array_append(bad, 'short suggestion'); end if;
  r := public.suggest_service('Befrienders Kenya', 'They run a free listening line');
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, 'suggest'); end if;
  reset role; perform set_config('request.jwt.claims', json_build_object('sub', ids[3], 'role', 'authenticated')::text, true); set local role authenticated;
  r := public.admin_help();
  sg := r->'suggestions'->0->>'id';
  r := public.admin_decide_suggestion(sg, true);
  if r->>'ok' is distinct from 'true' then bad := array_append(bad, ('accept suggestion: ' || r::text)); end if;
  r := public.admin_decide_suggestion(sg, false);
  if r->>'code' is distinct from 'gone' then bad := array_append(bad, 'suggestion decided twice'); end if;
  set local role anon; r := public.help_content(); reset role;
  if exists (select 1 from jsonb_array_elements(r->'supportOrgs') o where o->>'name' = 'Befrienders Kenya') then bad := array_append(bad, 'accepted suggestion shown before details are filled in'); end if;
  reset role;
  if not exists (select 1 from private.audit where action = 'Replied to ticket') or not exists (select 1 from private.audit where action = 'Verified crisis lines') then bad := array_append(bad, 'audit rows missing'); end if;
  if cardinality(bad) > 0 then raise exception 'FAILED: %', array_to_string(bad, '; '); end if;
  raise exception 'ALL HELP CHECKS PASSED';
end;
$$;
