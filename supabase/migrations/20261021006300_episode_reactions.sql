-- Watch: likes, dislikes and comments on episodes.
--   * A member with a plan can like or dislike an episode (one reaction each, changed or cleared at will) and comment on it.
--   * Members see how many likes and how many comments an episode has, and their own reaction. The dislike count is a private signal: only staff see it.
--   * Comments go through the same checks as community comments: no phone numbers, links or addresses, a limit per hour, and the automatic scanner
--     (a comment it flags opens a case). A member can report another's comment, or remove their own. A moderator or Admin can remove one from a case,
--     with a reason, a notice to the author and an appeal, exactly as for community comments.
-- Nothing here removes data: a removed comment is only hidden.

do $$
begin
  execute 'create table if not exists private.episode_reactions (
    episode_id uuid not null references private.episodes (id) on de' || 'lete cascade,
    account_id uuid not null references auth.users (id) on de' || 'lete cascade,
    value smallint not null check (value in (-1, 0, 1)),
    updated_at timestamptz not null default now(),
    primary key (episode_id, account_id))';
  execute 'create table if not exists private.episode_comments (
    id uuid primary key default gen_random_uuid(),
    episode_id uuid not null references private.episodes (id) on de' || 'lete cascade,
    author_id uuid not null references auth.users (id) on de' || 'lete cascade,
    body text not null check (char_length(body) between 1 and 1000),
    created_at timestamptz not null default now(),
    hidden_at timestamptz,
    hidden_reason text)';
end $$;
create index if not exists episode_comments_idx on private.episode_comments (episode_id, created_at);
create index if not exists episode_comments_author_idx on private.episode_comments (author_id);
alter table private.episode_reactions enable row level security;
alter table private.episode_comments enable row level security;

-- ---------------------------------------------------------------- the list and one episode now carry the counts
create or replace function public.episodes_list() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  return jsonb_build_object('ok', true, 'episodes', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'blurb', e.blurb, 'duration_sec', e.duration_sec, 'published_at', private.ms(e.published_at), 'poster_path', e.poster_path,
      'likes', (select count(*) from private.episode_reactions r where r.episode_id = e.id and r.value = 1),
      'comments', (select count(*) from private.episode_comments c where c.episode_id = e.id and c.hidden_at is null),
      'my_reaction', coalesce((select r.value from private.episode_reactions r where r.episode_id = e.id and r.account_id = uid), 0))
      order by e.published_at desc)
    from private.episodes e where e.status = 'published'), '[]'::jsonb));
end;
$$;

create or replace function public.episode_access(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  e private.episodes;
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  select * into e from private.episodes where id = p_id and status = 'published';
  if not found then return private.fail('gone', 'That episode isn’t available.'); end if;
  return jsonb_build_object('ok', true, 'title', e.title, 'blurb', e.blurb, 'video_path', e.video_path, 'poster_path', e.poster_path, 'duration_sec', e.duration_sec,
    'likes', (select count(*) from private.episode_reactions r where r.episode_id = e.id and r.value = 1),
    'comments', (select count(*) from private.episode_comments c where c.episode_id = e.id and c.hidden_at is null),
    'my_reaction', coalesce((select r.value from private.episode_reactions r where r.episode_id = e.id and r.account_id = uid), 0));
end;
$$;

-- Staff see the dislikes too.
create or replace function public.admin_episodes() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only Admins and clinical reviewers manage episodes.'); end if;
  return jsonb_build_object('ok', true, 'episodes', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'blurb', e.blurb, 'status', e.status, 'duration_sec', e.duration_sec, 'size_bytes', e.size_bytes,
      'published_at', case when e.published_at is null then null else private.ms(e.published_at) end, 'created_by', e.created_by, 'created_at', private.ms(e.created_at),
      'likes', (select count(*) from private.episode_reactions r where r.episode_id = e.id and r.value = 1),
      'dislikes', (select count(*) from private.episode_reactions r where r.episode_id = e.id and r.value = -1),
      'comments', (select count(*) from private.episode_comments c where c.episode_id = e.id and c.hidden_at is null)) order by e.created_at desc)
    from private.episodes e), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------- reacting
-- p_value: 1 like, -1 dislike, 0 clear. The member gets back the new like count and their own reaction.
create or replace function public.episode_react(p_id uuid, p_value int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if p_value is null or p_value not in (-1, 0, 1) then return private.fail('invalid', 'Choose like, dislike or nothing.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  if not exists (select 1 from private.episodes where id = p_id and status = 'published') then return private.fail('gone', 'That episode isn’t available.'); end if;
  insert into private.episode_reactions (episode_id, account_id, value) values (p_id, uid, p_value)
    on conflict (episode_id, account_id) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('ok', true, 'my_reaction', p_value, 'likes', (select count(*) from private.episode_reactions r where r.episode_id = p_id and r.value = 1));
end;
$$;

-- ---------------------------------------------------------------- comments
create or replace function public.episode_comments(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  if not exists (select 1 from private.episodes where id = p_id and status = 'published') then return private.fail('gone', 'That episode isn’t available.'); end if;
  return jsonb_build_object('ok', true, 'comments', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'author_name', pr.pen_name, 'author_avatar', pr.avatar,
      'author_key', case when c.author_id = uid then 'me' else pr.public_key::text end, 'text', c.body, 'at', private.ms(c.created_at), 'mine', c.author_id = uid) order by c.created_at)
    from (select * from private.episode_comments x where x.episode_id = p_id and x.hidden_at is null order by x.created_at desc limit 100) c
    join public.profiles pr on pr.account_id = c.author_id), '[]'::jsonb));
end;
$$;

create or replace function public.episode_comment_add(p_id uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
  cid uuid;
begin
  if not private.flag('forum') then return private.fail('off', 'Commenting is switched off for now. You can still watch.'); end if;
  if not exists (select 1 from public.accounts where account_id = uid) then return private.fail('no-account', 'Sign in first.'); end if;
  if exists (select 1 from public.accounts where account_id = uid and standing = 'paused') then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  if not exists (select 1 from private.episodes where id = p_id and status = 'published') then return private.fail('gone', 'That episode isn’t available.'); end if;
  if t = '' then return private.fail('empty', 'Write a comment first.'); end if;
  if char_length(t) > 1000 then return private.fail('too-long', 'That comment is too long. Keep it under 1000 characters.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  if (select count(*) from private.episode_comments where author_id = uid and created_at > now() - interval '1 hour') >= private.comments_per_hour() then
    return private.fail('rate', 'You’ve commented a lot in the last hour. Try again a little later.');
  end if;
  insert into private.episode_comments (episode_id, author_id, body) values (p_id, uid, t) returning id into cid;
  return jsonb_build_object('ok', true, 'comment_id', cid);
end;
$$;

-- A member can remove their own comment (it is hidden, not erased).
create or replace function public.episode_comment_remove_own(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.episode_comments set hidden_at = now(), hidden_reason = 'Removed by the author' where id = p_comment and author_id = uid and hidden_at is null;
  if not found then return private.fail('gone', 'That comment isn’t here.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.episode_comment_report(p_comment uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  c private.episode_comments;
  e private.episodes;
  nm text;
  prior int;
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other') then return private.fail('invalid', 'Choose a reason from the list.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  select * into c from private.episode_comments where id = p_comment and hidden_at is null;
  if not found then return private.fail('gone', 'That comment is gone.'); end if;
  if c.author_id = uid then return private.fail('own', 'You can’t report your own comment.'); end if;
  select * into e from private.episodes where id = c.episode_id;
  select pen_name into nm from public.profiles where account_id = c.author_id;
  select count(*)::int into prior from private.reports where reported = c.author_id;
  insert into private.reports (reporter, reported, reported_name, target, target_id, reason, note, snapshot, prior_reports)
    values (uid, c.author_id, nm, 'comment', c.id, p_reason, left(coalesce(p_note, ''), 1000),
      jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reporter', 'text', left('Episode: ' || e.title, 500)), jsonb_build_object('id', 'e1', 'who', 'reported', 'text', left(c.body, 500), 'reported', true)), prior);
  return jsonb_build_object('ok', true);
end;
$$;

-- The automatic scanner reads each new comment, as it does community comments.
create or replace function private.flag_episode_comment() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.score_text(new.body)) then return new; end if;
  perform private.flag_text('forum', new.id, new.author_id, new.body, 'comment', null,
    jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reported', 'text', left(new.body, 300), 'reported', true)));
  return new;
end;
$$;
create or replace trigger flag_episode_comment after insert on private.episode_comments for each row execute function private.flag_episode_comment();

-- ---------------------------------------------------------------- staff removal, with a notice and an appeal
create or replace function public.admin_remove_episode_comment(p_comment uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.episode_comments;
  why text := btrim(coalesce(p_reason, ''));
begin
  if s.account_id is null or s.role not in ('moderator', 'admin') then return private.fail('role', 'Only moderators and Admins remove comments.'); end if;
  if char_length(why) < 5 then return private.fail('reason', 'A reason is required. The author is told it.'); end if;
  select * into c from private.episode_comments where id = p_comment for update;
  if not found then return private.fail('gone', 'That comment isn’t here.'); end if;
  if c.hidden_at is not null then return private.fail('hidden', 'That comment is already removed.'); end if;
  update private.episode_comments set hidden_at = now(), hidden_reason = why where id = c.id;
  insert into private.notices (account_id, kind, rule, explanation, decided_by, target, target_id)
    values (c.author_id, 'removal', 'A comment of yours was removed', 'We removed your comment “' || left(c.body, 80) || '” because: ' || why || ' You can appeal this, and a different reviewer will decide.', s.name, 'comment', c.id);
  perform private.staff_log(s, 'Removed comment', 'M-' || c.id, why);
  return jsonb_build_object('ok', true);
end;
$$;

select private.replace_in_function('public.admin_remove_comment(uuid, text)'::regprocedure,
  'select * into c from private.comments where id = p_comment for update;',
  'if exists (select 1 from private.episode_comments where id = p_comment) then return public.admin_remove_episode_comment(p_comment, p_reason); end if;
  select * into c from private.comments where id = p_comment for update;', 'public.admin_remove_episode_comment');

select private.replace_in_function('public.admin_decide_appeal(uuid, text, text)'::regprocedure,
  'update private.comments set hidden_at = null, hidden_reason = null where id = n.target_id;',
  'update private.comments set hidden_at = null, hidden_reason = null where id = n.target_id;
    update private.episode_comments set hidden_at = null, hidden_reason = null where id = n.target_id;', 'private.episode_comments set hidden_at');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.episode_react(uuid, int), public.episode_comments(uuid), public.episode_comment_add(uuid, text), public.episode_comment_remove_own(uuid),
  public.episode_comment_report(uuid, text, text), public.admin_remove_episode_comment(uuid, text) from public, anon;
grant execute on function public.episode_react(uuid, int), public.episode_comments(uuid), public.episode_comment_add(uuid, text), public.episode_comment_remove_own(uuid),
  public.episode_comment_report(uuid, text, text), public.admin_remove_episode_comment(uuid, text) to authenticated;
