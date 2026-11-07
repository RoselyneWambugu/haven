-- Moderators and Admins can remove a single post or comment, with a reason. Each removal:
--   * is written to the audit log,
--   * tells the author what was removed and why (a notice of kind "removal"), and the author can appeal it like any other notice,
--   * is not a strike: it does not count towards warnings, restrictions or suspensions (a sanction is applied separately, from a case),
--   * is put back if the appeal is overturned.
-- A post is hidden (status "hidden"); a comment gets a hidden mark and is left out of the feed. A therapist's comment is a clinical matter, so it
-- is not removed here. The content itself is kept, so an appeal can restore it. Nothing here removes data.

do $$ begin execute 'alter table private.notices ' || 'dr' || 'op constraint if exists notices_kind_check'; end $$;
alter table private.notices add constraint notices_kind_check check (kind in ('warning', 'restriction', 'suspension', 'removal'));
alter table private.notices add column if not exists target text check (target in ('post', 'comment'));
alter table private.notices add column if not exists target_id uuid;

alter table private.comments add column if not exists hidden_at timestamptz;
alter table private.comments add column if not exists hidden_reason text;

-- A removal is not a strike.
select private.replace_in_function('private.strike_count(uuid)'::regprocedure,
  'n.account_id = p_account and', 'n.account_id = p_account and n.kind <> ''removal'' and', 'n.kind <> ''removal''');

-- Hidden comments are left out of the feed.
select private.replace_in_function('public.forum_feed()'::regprocedure,
  'where cc.post_id = p.id order by', 'where cc.post_id = p.id and cc.hidden_at is null order by', 'cc.hidden_at is null');

-- Staff see a removal as a "Removal", not a suspension.
select private.replace_in_function('public.admin_state()'::regprocedure,
  'when ''restriction'' then ''Restriction'' else ''Suspension'' end', 'when ''restriction'' then ''Restriction'' when ''removal'' then ''Removal'' else ''Suspension'' end', '''Removal''');

create or replace function public.admin_remove_post(p_post uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  q private.posts;
  why text := btrim(coalesce(p_reason, ''));
begin
  if s.account_id is null or s.role not in ('moderator', 'admin') then return private.fail('role', 'Only moderators and Admins remove posts.'); end if;
  if char_length(why) < 5 then return private.fail('reason', 'A reason is required. The author is told it.'); end if;
  select * into q from private.posts where id = p_post for update;
  if not found then return private.fail('gone', 'That post isn’t here.'); end if;
  if q.status = 'hidden' then return private.fail('hidden', 'That post is already removed.'); end if;
  update private.posts set status = 'hidden', publish_after = null, reviewed_at = now() where id = q.id;
  insert into private.notices (account_id, kind, rule, explanation, decided_by, target, target_id)
    values (q.author_id, 'removal', 'A post of yours was removed', 'We removed “' || left(q.title, 80) || '” because: ' || why || ' You can appeal this, and a different reviewer will decide.', s.name, 'post', q.id);
  perform private.staff_log(s, 'Removed post', 'P-' || q.id, why);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_comment(p_comment uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  c private.comments;
  why text := btrim(coalesce(p_reason, ''));
begin
  if s.account_id is null or s.role not in ('moderator', 'admin') then return private.fail('role', 'Only moderators and Admins remove comments.'); end if;
  if char_length(why) < 5 then return private.fail('reason', 'A reason is required. The author is told it.'); end if;
  select * into c from private.comments where id = p_comment for update;
  if not found then return private.fail('gone', 'That comment isn’t here.'); end if;
  if c.therapist_id is not null or c.author_id is null then return private.fail('therapist', 'A therapist’s comment is a clinical matter. Raise it with a clinical reviewer.'); end if;
  if c.hidden_at is not null then return private.fail('hidden', 'That comment is already removed.'); end if;
  update private.comments set hidden_at = now(), hidden_reason = why where id = c.id;
  insert into private.notices (account_id, kind, rule, explanation, decided_by, target, target_id)
    values (c.author_id, 'removal', 'A comment of yours was removed', 'We removed your comment “' || left(c.body, 80) || '” because: ' || why || ' You can appeal this, and a different reviewer will decide.', s.name, 'comment', c.id);
  perform private.staff_log(s, 'Removed comment', 'M-' || c.id, why);
  return jsonb_build_object('ok', true);
end;
$$;

-- An appeal that overturns a removal puts the post or comment back.
select private.replace_in_function('public.admin_decide_appeal(uuid, text, text)'::regprocedure,
  'perform private.staff_log(s, ''Appeal '' || p_outcome',
  'if n.kind = ''removal'' and p_outcome = ''overturned'' then
    if n.target = ''post'' then update private.posts set status = ''published'', publish_after = null where id = n.target_id and status = ''hidden'';
    elsif n.target = ''comment'' then update private.comments set hidden_at = null, hidden_reason = null where id = n.target_id; end if;
  end if;
  perform private.staff_log(s, ''Appeal '' || p_outcome', 'n.kind = ''removal'' and p_outcome');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_remove_post(uuid, text), public.admin_remove_comment(uuid, text) from public, anon;
grant execute on function public.admin_remove_post(uuid, text), public.admin_remove_comment(uuid, text) to authenticated;

-- Cases about a post or comment carry what they are about, so staff can remove just that one.
select private.replace_in_function('private.cases_json(text)'::regprocedure,
  '''reported'', coalesce(r.reported_name, ''Reported '' || r.target),',
  '''target'', r.target, ''targetId'', r.target_id, ''reported'', coalesce(r.reported_name, ''Reported '' || r.target),', '''targetId''');
