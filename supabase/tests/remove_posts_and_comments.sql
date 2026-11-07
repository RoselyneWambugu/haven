-- Removing a post or comment: who can, the reason, the notice to the author (not a strike), the audit log, and an appeal that restores it.
-- Run it in the SQL editor. One transaction that always ends in an error, so nothing is kept. Success: "ALL PASSED (rolled back)".
do $$
declare
  mod1 uuid := gen_random_uuid(); mod2 uuid := gen_random_uuid(); clin uuid := gen_random_uuid(); au uuid := gen_random_uuid(); ob uuid := gen_random_uuid();
  pid uuid; cid uuid; cid2 uuid; tcid uuid; nid uuid;
  r jsonb; bad text[] := '{}'; n int := 90; u uuid; x private.posts; k int;
begin
  foreach u in array array[mod1, mod2, clin, au, ob] loop
    n := n + 1;
    insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at) values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '2547120000' || n, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
    r := public.register_member('Test Person', date '1995-05-05', null, 'Pen' || n, 'moon', array['English'], array[]::text[], 'v1');
    if r->>'ok' is distinct from 'true' then raise exception 'SETUP FAILED %', r::text; end if;
    reset role;
  end loop;
  insert into private.staff (account_id, name, role, heavy) values (mod1, 'M. One', 'moderator', false), (mod2, 'M. Two', 'moderator', false), (clin, 'C. Three', 'clinical', false);
  insert into private.posts (author_id, topic, title, body, status) values (au, 'Grief', 'A gentle post', 'Went for a walk and felt a little lighter than last week.', 'published') returning id into pid;
  insert into private.comments (post_id, author_id, body) values (pid, au, 'A kind word from me to anyone reading this.') returning id into cid;
  insert into private.comments (post_id, author_id, body) values (pid, au, 'A second comment that stays in place.') returning id into cid2;
  insert into private.comments (post_id, author_id, therapist_id, body) values (pid, ob, 't-amina', 'General information only, from a therapist.') returning id into tcid;

  perform set_config('request.jwt.claims', json_build_object('sub', clin, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_remove_post(pid, 'Breaks the guidelines');
  if r->>'code' is distinct from 'role' then bad := bad || ('clinical removed: ' || r::text); end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', mod1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_remove_post(pid, 'no');
  if r->>'code' is distinct from 'reason' then bad := bad || ('short reason: ' || r::text); end if;
  r := public.admin_remove_comment(tcid, 'Breaks the guidelines');
  if r->>'code' is distinct from 'therapist' then bad := bad || ('therapist comment: ' || r::text); end if;
  r := public.admin_remove_comment(cid, 'Mocks another member');
  if r->>'ok' is distinct from 'true' then bad := bad || ('remove comment: ' || r::text); end if;
  r := public.admin_remove_comment(cid, 'Mocks another member');
  if r->>'code' is distinct from 'hidden' then bad := bad || ('comment twice: ' || r::text); end if;
  r := public.admin_remove_post(pid, 'Contains a rumour about a named person');
  if r->>'ok' is distinct from 'true' then bad := bad || ('remove post: ' || r::text); end if;
  r := public.admin_remove_post(pid, 'Contains a rumour about a named person');
  if r->>'code' is distinct from 'hidden' then bad := bad || ('post twice: ' || r::text); end if;
  reset role;
  select * into x from private.posts where id = pid;
  if x.status <> 'hidden' then bad := bad || 'post not hidden'; end if;
  if not exists (select 1 from private.comments where id = cid and hidden_at is not null) then bad := bad || 'comment not hidden'; end if;
  if exists (select 1 from private.comments where id = cid2 and hidden_at is not null) then bad := bad || 'other comment hidden'; end if;
  if (select count(*) from private.audit where action in ('Removed post', 'Removed comment')) <> 2 then bad := bad || 'audit'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', au, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.my_notices();
  select count(*) into k from jsonb_array_elements(r->'notices') e where e->>'kind' = 'removal';
  if k <> 2 then bad := bad || ('notices: ' || r::text); end if;
  reset role;
  if private.strike_count(au) <> 0 then bad := bad || 'removal counted as a strike'; end if;
  select id into nid from private.notices where account_id = au and target = 'post';

  perform set_config('request.jwt.claims', json_build_object('sub', au, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.appeal_notice(nid, 'This was a story about my own family, not a rumour at all');
  if r->>'ok' is distinct from 'true' then bad := bad || ('appeal: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mod1, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_decide_appeal(nid, 'overturned', 'Read again, it is fine to stay up.');
  if r->>'code' is distinct from 'same-reviewer' then bad := bad || ('same reviewer: ' || r::text); end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mod2, 'role', 'authenticated', 'aal', 'aal2')::text, true); set local role authenticated;
  r := public.admin_decide_appeal(nid, 'overturned', 'Read again, it is fine to stay up.');
  if r->>'ok' is distinct from 'true' then bad := bad || ('overturn: ' || r::text); end if;
  reset role;
  select * into x from private.posts where id = pid;
  if x.status <> 'published' then bad := bad || 'post not restored'; end if;

  if array_length(bad, 1) > 0 then raise exception 'FAILED: %', array_to_string(bad, ' | '); end if;
  raise exception 'ALL PASSED (rolled back)';
end $$;
