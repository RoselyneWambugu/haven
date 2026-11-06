-- Polls: a quick question with two to four answers. Everyone with a plan can vote once. A poll is a post in one built-in room (like Gossip),
-- so reports, the moderator's tools, rate limits and the first-post check all apply. No names of real people. Nobody sees who voted.

insert into private.spaces (id, name, sensitive) values ('polls', 'Polls', false)
  on conflict (id) do update set name = excluded.name, sensitive = excluded.sensitive;

alter table private.posts add column if not exists poll_closes_at timestamptz;

create table if not exists private.poll_options (
  post_id uuid not null references private.posts (id) on delete cascade,
  idx smallint not null check (idx between 0 and 3),
  text text not null check (char_length(text) between 1 and 40),
  primary key (post_id, idx)
);
create table if not exists private.poll_votes (
  post_id uuid not null references private.posts (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  idx smallint not null check (idx between 0 and 3),
  primary key (post_id, account_id)
);
create index if not exists poll_votes_account_idx on private.poll_votes (account_id);
alter table private.poll_options enable row level security;
alter table private.poll_votes enable row level security;

create or replace function public.create_poll(p_question text, p_options text[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  a public.accounts;
  q text := btrim(coalesce(p_question, ''));
  opts text[] := '{}';
  o text;
  all_text text;
  reasons text[];
  hold boolean;
  pid uuid;
  i int;
begin
  if not private.flag('forum') then return private.fail('off', 'Posting is switched off for now. You can still read the community.'); end if;
  select * into a from public.accounts where account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  if a.standing = 'paused' then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  if char_length(q) < 10 then return private.fail('question', 'Ask a question of at least 10 characters.'); end if;
  if char_length(q) > 120 then return private.fail('question', 'Keep the question under 120 characters.'); end if;
  foreach o in array coalesce(p_options, '{}') loop
    if btrim(coalesce(o, '')) <> '' then opts := array_append(opts, btrim(o)); end if;
  end loop;
  if cardinality(opts) < 2 or cardinality(opts) > 4 then return private.fail('options', 'Give two to four answers.'); end if;
  for i in 1..cardinality(opts) loop
    if char_length(opts[i]) > 40 then return private.fail('options', 'Keep each answer under 40 characters.'); end if;
    if exists (select 1 from unnest(opts) with ordinality u(t, n) where lower(u.t) = lower(opts[i]) and u.n <> i) then return private.fail('options', 'Each answer must be different.'); end if;
  end loop;
  all_text := q || chr(10) || array_to_string(opts, chr(10));
  reasons := private.blocked_reasons(all_text);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  if private.gossip_names(all_text) is not null then
    return private.fail('names', 'That looks like a name (' || private.gossip_names(all_text) || '). Leave names out, so nobody can be pointed at.');
  end if;
  if (select count(*) from private.posts where author_id = uid and created_at > now() - interval '1 hour') >= private.posts_per_hour() then
    return private.fail('rate', 'You’ve posted a lot in the last hour. Try again a little later.');
  end if;
  hold := not a.has_posted_before;
  insert into private.posts (author_id, space_id, topic, title, body, status, publish_after, poll_closes_at)
    values (uid, 'polls', 'Polls', q, 'Poll: ' || array_to_string(opts, ' / '), case when hold then 'pending' else 'published' end, case when hold then now() + private.auto_approve_after() end, now() + interval '7 days')
    returning id into pid;
  for i in 1..cardinality(opts) loop
    insert into private.poll_options (post_id, idx, text) values (pid, i - 1, opts[i]);
  end loop;
  update public.accounts set has_posted_before = true where account_id = uid;
  return jsonb_build_object('ok', true, 'post_id', pid, 'pending', hold);
end;
$$;

create or replace function public.poll_vote(p_post uuid, p_idx int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  p private.posts;
begin
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  select * into p from private.posts where id = p_post and space_id = 'polls';
  if not found or not private.can_read_post(p_post, uid) or p.status <> 'published' then return private.fail('gone', 'That poll isn’t here.'); end if;
  if p.poll_closes_at <= now() then return private.fail('closed', 'This poll has closed.'); end if;
  if not exists (select 1 from private.poll_options where post_id = p_post and idx = p_idx) then return private.fail('option', 'Choose one of the answers.'); end if;
  insert into private.poll_votes (post_id, account_id, idx) values (p_post, uid, p_idx) on conflict (post_id, account_id) do nothing;
  if not found then return private.fail('voted', 'You have already voted in this poll.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- The answers and, once the member has voted (or the poll has closed, or it is theirs), the counts. Counts are hidden before that so they cannot sway a vote.
create or replace function public.poll_list() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  return jsonb_build_object('ok', true, 'polls', coalesce((
    select jsonb_object_agg(p.id::text, jsonb_build_object(
      'closesAt', private.ms(p.poll_closes_at),
      'myVote', (select v.idx from private.poll_votes v where v.post_id = p.id and v.account_id = uid),
      'options', (
        select jsonb_agg(jsonb_build_object('text', o.text, 'votes', case when p.author_id = uid or p.poll_closes_at <= now() or exists (select 1 from private.poll_votes v where v.post_id = p.id and v.account_id = uid)
                                                       then (select count(*) from private.poll_votes v where v.post_id = p.id and v.idx = o.idx) else null end) order by o.idx)
        from private.poll_options o where o.post_id = p.id)))
    from (select * from private.posts q where q.space_id = 'polls' and private.can_read_post(q.id, uid) order by q.created_at desc limit 50) p), '{}'::jsonb));
end;
$$;

-- A poll's question and answers are fixed once it is posted, so editing the text is refused.
select private.patch_function('public.edit_post(uuid, text, text)'::regprocedure,
  $p$select \* into p from private\.posts where id = p_post and author_id = uid;$p$,
  $p$select * into p from private.posts where id = p_post and author_id = uid;
  if found and p.space_id = 'polls' then return private.fail('poll', 'A poll can’t be edited once it is posted. Remove it and ask again.'); end if;$p$,
  'A poll can’t be edited');

-- Polls take votes, not replies.
select private.patch_function('public.add_comment(uuid, text)'::regprocedure,
  $p$if p\.space_id = 'gossip' then$p$,
  $p$if p.space_id in ('gossip', 'polls') then$p$,
  $p$in ('gossip', 'polls')$p$);

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.create_poll(text, text[]), public.poll_vote(uuid, int), public.poll_list() from public, anon;
grant execute on function public.create_poll(text, text[]), public.poll_vote(uuid, int), public.poll_list() to authenticated;
