-- Safe to run more than once. Paste the whole file into the Supabase SQL editor.
-- Echo backend, slice 3: the community forum and support spaces.
-- Nothing here is readable by the app directly. Reading goes through forum_feed(); every write goes through a function that checks the rules.

alter table public.profiles add column if not exists public_key uuid not null default gen_random_uuid();
create unique index if not exists profiles_public_key_idx on public.profiles (public_key);

alter table private.reports add column if not exists target_id uuid;

create or replace function private.posts_per_hour() returns int language sql immutable set search_path = '' as $$ select 10 $$;
create or replace function private.comments_per_hour() returns int language sql immutable set search_path = '' as $$ select 60 $$;
create or replace function private.edit_window() returns interval language sql immutable set search_path = '' as $$ select interval '15 minutes' $$;
-- A post that needs a check goes live after this long. Until staff have a review queue, this stands in for it.
create or replace function private.auto_approve_after() returns interval language sql immutable set search_path = '' as $$ select interval '15 seconds' $$;

create table if not exists private.spaces (
  id text primary key,
  name text not null,
  sensitive boolean not null default false
);
insert into private.spaces (id, name, sensitive) values
  ('domestic-violence', 'Domestic violence and abuse', true),
  ('ptsd', 'PTSD and trauma', true),
  ('grief', 'Grief and loss', false),
  ('anxiety', 'Anxiety and panic', false),
  ('depression', 'Depression and low mood', false),
  ('recovery', 'Addiction and recovery', false)
on conflict (id) do update set name = excluded.name, sensitive = excluded.sensitive;

create table if not exists private.space_members (
  account_id uuid not null references auth.users (id) on delete cascade,
  space_id text not null references private.spaces (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (account_id, space_id)
);

create table if not exists private.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  space_id text references private.spaces (id),
  topic text not null,
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 10 and 5000),
  status text not null default 'published' check (status in ('pending', 'published', 'hidden')),
  publish_after timestamptz,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists posts_created_idx on private.posts (created_at desc);
create index if not exists posts_author_idx on private.posts (author_id);

create table if not exists private.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references private.posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists comments_post_idx on private.comments (post_id, created_at);

create table if not exists private.supports (
  post_id uuid not null references private.posts (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  primary key (post_id, account_id)
);

alter table private.spaces enable row level security;
alter table private.space_members enable row level security;
alter table private.posts enable row level security;
alter table private.comments enable row level security;
alter table private.supports enable row level security;

-- A post can be read when it is live and its space is open to the reader, or when it is the reader's own.
create or replace function private.can_read_post(p_post uuid, p_account uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from private.posts p left join private.spaces s on s.id = p.space_id
    where p.id = p_post and (
      p.author_id = p_account
      or (p.status = 'published' and (s.id is null or not s.sensitive or exists (select 1 from private.space_members m where m.space_id = s.id and m.account_id = p_account))))
  )
$$;

create or replace function public.join_space(p_space text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not exists (select 1 from private.spaces where id = p_space) then return private.fail('space', 'That space isn’t here.'); end if;
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Support spaces need an active plan.'); end if;
  insert into private.space_members (account_id, space_id) values (uid, p_space) on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- Leaving is always possible, tells nobody, and keeps no record.
create or replace function public.leave_space(p_space text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  delete from private.space_members where account_id = uid and space_id = p_space;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.create_post(p_topic text, p_title text, p_body text, p_space text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  a public.accounts;
  sp private.spaces;
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  reasons text[];
  v_topic text := p_topic;
  hold boolean;
  pid uuid;
begin
  select * into a from public.accounts where account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  if a.standing = 'paused' then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  if t = '' then return private.fail('title', 'Add a title.'); end if;
  if char_length(t) > 140 then return private.fail('title', 'Keep the title under 140 characters.'); end if;
  if char_length(b) < 10 then return private.fail('body', 'Write a little more. A few sentences is plenty.'); end if;
  if char_length(b) > 5000 then return private.fail('body', 'That post is too long. Try splitting it.'); end if;
  reasons := private.blocked_reasons(t || E'\n' || b);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  if p_space is not null then
    select * into sp from private.spaces where id = p_space;
    if not found then return private.fail('space', 'That space isn’t here.'); end if;
    if not exists (select 1 from private.space_members where account_id = uid and space_id = p_space) then return private.fail('not-joined', 'Join this space to post in it.'); end if;
    v_topic := sp.name;
  elsif v_topic is null or not (array[v_topic] <@ private.allowed_topics()) then
    return private.fail('topic', 'Choose a topic from the list.');
  end if;
  if (select count(*) from private.posts where author_id = uid and created_at > now() - interval '1 hour') >= private.posts_per_hour() then
    return private.fail('rate', 'You’ve posted a lot in the last hour. Try again a little later.');
  end if;
  -- A member's first post, and every post in a sensitive space, is checked before it goes live.
  hold := not a.has_posted_before or coalesce(sp.sensitive, false);
  insert into private.posts (author_id, space_id, topic, title, body, status, publish_after)
    values (uid, p_space, v_topic, t, b, case when hold then 'pending' else 'published' end, case when hold then now() + private.auto_approve_after() end)
    returning id into pid;
  update public.accounts set has_posted_before = true where account_id = uid;
  return jsonb_build_object('ok', true, 'post_id', pid, 'pending', hold);
end;
$$;

create or replace function public.edit_post(p_post uuid, p_title text, p_body text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  p private.posts;
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_body, ''));
  reasons text[];
begin
  select * into p from private.posts where id = p_post and author_id = uid;
  if not found then return private.fail('gone', 'You can only edit your own post.'); end if;
  if now() - p.created_at > private.edit_window() then return private.fail('window', 'You can edit a post for 15 minutes after posting.'); end if;
  if t = '' or char_length(t) > 140 then return private.fail('title', 'Add a title of up to 140 characters.'); end if;
  if char_length(b) < 10 or char_length(b) > 5000 then return private.fail('body', 'Write between 10 and 5000 characters.'); end if;
  reasons := private.blocked_reasons(t || E'\n' || b);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  update private.posts set title = t, body = b, edited_at = now() where id = p_post;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remove_post(p_post uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  delete from private.posts where id = p_post and author_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.add_comment(p_post uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  p private.posts;
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
  cid uuid;
begin
  if not exists (select 1 from public.accounts where account_id = uid) then return private.fail('no-account', 'Sign in first.'); end if;
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.can_read_post(p_post, uid) then return private.fail('gone', 'That post is gone.'); end if;
  select * into p from private.posts where id = p_post;
  if p.status <> 'published' then return private.fail('pending', 'You can comment once the post is live.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  if t = '' then return private.fail('empty', 'Write a comment first.'); end if;
  if char_length(t) > 2000 then return private.fail('too-long', 'That comment is too long.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  if (select count(*) from private.comments where author_id = uid and created_at > now() - interval '1 hour') >= private.comments_per_hour() then
    return private.fail('rate', 'You’ve commented a lot in the last hour. Try again a little later.');
  end if;
  insert into private.comments (post_id, author_id, body) values (p_post, uid, t) returning id into cid;
  return jsonb_build_object('ok', true, 'comment_id', cid);
end;
$$;

create or replace function public.toggle_support(p_post uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  on_now boolean;
begin
  if not private.can_read_post(p_post, uid) or not exists (select 1 from private.posts where id = p_post and status = 'published') then
    return private.fail('gone', 'That post is gone.');
  end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  delete from private.supports where post_id = p_post and account_id = uid;
  on_now := not found;
  if on_now then insert into private.supports (post_id, account_id) values (p_post, uid); end if;
  return jsonb_build_object('ok', true, 'supported', on_now, 'supports', (select count(*) from private.supports where post_id = p_post));
end;
$$;

-- What the member can read: live posts from open spaces and the general community, and their own posts that are still being checked.
create or replace function public.forum_feed() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'The community needs an active plan.'); end if;
  update private.posts set status = 'published', publish_after = null where status = 'pending' and publish_after <= now();
  return jsonb_build_object(
    'ok', true,
    'spaces', coalesce((select jsonb_agg(m.space_id order by m.joined_at) from private.space_members m where m.account_id = uid), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'author_name', pr.pen_name, 'author_avatar', pr.avatar,
        'author_key', case when p.author_id = uid then 'me' else pr.public_key::text end,
        'topic', p.topic, 'space', p.space_id, 'title', p.title, 'body', p.body, 'created_at', p.created_at, 'status', p.status, 'mine', p.author_id = uid,
        'supports', (select count(*) from private.supports s where s.post_id = p.id),
        'supported_by_me', exists (select 1 from private.supports s where s.post_id = p.id and s.account_id = uid),
        'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'author_name', cp.pen_name, 'author_avatar', cp.avatar, 'text', c.body, 'at', c.created_at, 'mine', c.author_id = uid) order by c.created_at)
                              from (select * from private.comments cc where cc.post_id = p.id order by cc.created_at desc limit 100) c join public.profiles cp on cp.account_id = c.author_id), '[]'::jsonb)
      ) order by p.created_at desc)
      from (select * from private.posts q where private.can_read_post(q.id, uid) order by q.created_at desc limit 100) p
      join public.profiles pr on pr.account_id = p.author_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.report_post(p_post uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  p private.posts;
  nm text;
  prior int;
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other') then return private.fail('invalid', 'Choose a reason from the list.'); end if;
  if not private.can_read_post(p_post, uid) then return private.fail('gone', 'That post is gone.'); end if;
  select * into p from private.posts where id = p_post;
  if p.author_id = uid then return private.fail('own', 'You can’t report your own post.'); end if;
  select pen_name into nm from public.profiles where account_id = p.author_id;
  select count(*)::int into prior from private.reports where reported = p.author_id;
  insert into private.reports (reporter, reported, reported_name, target, target_id, reason, note, snapshot, prior_reports)
    values (uid, p.author_id, nm, 'post', p.id, p_reason, left(coalesce(p_note, ''), 1000),
            jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reported', 'text', left(p.title || E'\n' || p.body, 500) || case when length(p.title || E'\n' || p.body) > 500 then '…' else '' end, 'reported', true)), prior);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.report_comment(p_comment uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  c private.comments;
  p private.posts;
  prev private.comments;
  nm text;
  prior int;
  snap jsonb;
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other') then return private.fail('invalid', 'Choose a reason from the list.'); end if;
  select * into c from private.comments where id = p_comment;
  if not found or not private.can_read_post(c.post_id, uid) then return private.fail('gone', 'That comment is gone.'); end if;
  if c.author_id = uid then return private.fail('own', 'You can’t report your own comment.'); end if;
  select * into p from private.posts where id = c.post_id;
  select * into prev from private.comments where post_id = c.post_id and created_at < c.created_at order by created_at desc limit 1;
  select pen_name into nm from public.profiles where account_id = c.author_id;
  select count(*)::int into prior from private.reports where reported = c.author_id;
  snap := jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reporter', 'text', left('Post: ' || p.title, 500)));
  if prev.id is not null then snap := snap || jsonb_build_object('id', 'e1', 'who', 'reporter', 'text', left(prev.body, 500)); end if;
  snap := snap || jsonb_build_object('id', 'e' || jsonb_array_length(snap), 'who', 'reported', 'text', left(c.body, 500), 'reported', true);
  insert into private.reports (reporter, reported, reported_name, target, target_id, reason, note, snapshot, prior_reports)
    values (uid, c.author_id, nm, 'comment', c.id, p_reason, left(coalesce(p_note, ''), 1000), snap, prior);
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'join_space(text)', 'leave_space(text)', 'create_post(text,text,text,text)', 'edit_post(uuid,text,text)', 'remove_post(uuid)',
    'add_comment(uuid,text)', 'toggle_support(uuid)', 'forum_feed()', 'report_post(uuid,text,text)', 'report_comment(uuid,text,text)'])
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema private from public, anon, authenticated;

select 'forum and spaces ready' as status, (select count(*) from private.spaces) as spaces;
