-- Screening posts so moderators don't read everything.
--  1. A post the scanner scores high (threats, hate, scams, sexual solicitation, harassment) is held automatically: only its author sees it until a
--     moderator approves or removes it. Lower scores stay visible and open a case as before. A self-harm score is never held (that member needs a
--     supportive answer quickly, so it goes to the front of the case queue instead).
--  2. The queue is ordered by severity: held posts by score, cases by severity (S1 first), newest first within a level.
--  3. A post that several different members report is held until a moderator looks (default 3; 0 turns it off). A post a moderator has already
--     approved is not held again.
-- The numbers are in private.config (key screening: holdAt, reportHold). Nothing here removes data.

alter table private.posts add column if not exists held_reason text;
alter table private.posts add column if not exists held_score numeric;
alter table private.posts add column if not exists reviewed_at timestamptz;

insert into private.config (key, value) values ('screening', '{"holdAt":0.8,"reportHold":3}') on conflict (key) do nothing;

create or replace function private.screen_cfg(p_key text, p_default numeric) returns numeric
language sql stable set search_path = ''
as $$ select coalesce((select (value ->> p_key)::numeric from private.config where key = 'screening'), p_default) $$;

-- ---------------------------------------------------------------- 1. hold what scores high
create or replace function private.flag_post() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  select * into s from private.score_text(new.title || E'\n' || new.body);
  if s.category is null then return new; end if;
  perform private.flag_text('forum', new.id, new.author_id, new.title || E'\n' || new.body, 'post', null,
    jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reported', 'text', left(new.title || ': ' || new.body, 300), 'reported', true)));
  if s.category <> 'Self-harm concern' and s.confidence >= private.screen_cfg('holdAt', 0.8) then
    update private.posts set status = 'pending', publish_after = null, held_reason = s.category, held_score = s.confidence where id = new.id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- 3. several reports hold a post
create or replace function public.report_post(p_post uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  p private.posts;
  nm text;
  prior int;
  need int := private.screen_cfg('reportHold', 3)::int;
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
  if need > 0 and p.status = 'published' and p.reviewed_at is null
     and (select count(distinct r.reporter) from private.reports r where r.target = 'post' and r.target_id = p.id and r.reporter is not null and r.reason <> 'self-harm') >= need then
    update private.posts set status = 'pending', publish_after = null, held_reason = 'Reported by members', held_score = coalesce(held_score, 0.5) where id = p.id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A moderator's decision is final: an approved post is not held again by more reports.
create or replace function public.admin_review_post(p_post uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  q private.posts;
begin
  if s.account_id is null or s.role not in ('moderator', 'admin') then return private.fail('role', 'Only moderators and Admins review held posts.'); end if;
  select * into q from private.posts where id = p_post and status = 'pending' for update;
  if not found then return private.fail('gone', 'This post has already been reviewed.'); end if;
  update private.posts set status = case when p_approve then 'published' else 'hidden' end, publish_after = null, reviewed_at = now() where id = q.id;
  perform private.staff_log(s, case when p_approve then 'Approved held post' else 'Removed held post' end, 'P-' || q.id, coalesce(p_reason, ''));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- 2. the queue, worst first
select private.replace_in_function('public.admin_state()'::regprocedure,
  '''topic'', q.topic) order by q.created_at)',
  '''topic'', q.topic, ''reason'', q.held_reason, ''score'', q.held_score) order by q.held_score desc nulls last, q.created_at)', '''reason'', q.held_reason');
select private.replace_in_function('private.cases_json(text)'::regprocedure,
  'order by c->>''openedAtIso'' desc), ''[]''', 'order by c->>''severity'', c->>''openedAtIso'' desc), ''[]''', 'order by c->>''severity''');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.report_post(uuid, text, text), public.admin_review_post(uuid, boolean, text) from public, anon;
grant execute on function public.report_post(uuid, text, text), public.admin_review_post(uuid, boolean, text) to authenticated;
