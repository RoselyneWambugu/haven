-- Automated flags (PRD SAF-6 to SAF-9, ADM-13). The server scores what members write with its own pattern rules (model "rules-v1").
-- Nothing leaves Supabase. A flag is a signal: it opens a case for a person to decide, and the person's decision becomes the flag's outcome.
-- A real model can later write to the same log under its own model name.

create table if not exists private.flag_rules (
  id int generated always as identity primary key,
  category text not null,
  reason text not null,
  pattern text not null,
  confidence numeric(3,2) not null check (confidence between 0.01 and 0.99),
  enabled boolean not null default true
);
create table if not exists private.flags (
  id bigint generated always as identity primary key,
  category text not null,
  confidence numeric(3,2) not null,
  model text not null default 'rules-v1',
  surface text not null check (surface in ('chat', 'forum', 'group')),
  message_ref uuid,
  account_id uuid references auth.users (id) on delete set null,
  report_id uuid,
  outcome text not null default 'open' check (outcome in ('open', 'upheld', 'overturned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists flags_message_idx on private.flags (message_ref) where message_ref is not null;
create index if not exists flags_account_idx on private.flags (account_id, category, created_at desc);
create index if not exists flags_report_idx on private.flags (report_id);
alter table private.flag_rules enable row level security;
alter table private.flags enable row level security;
alter table private.reports add column if not exists flag_id bigint;

insert into private.flag_rules (category, reason, pattern, confidence)
select v.c, v.r, v.p, v.k from (values
  ('Harassment', 'harassment', '\y(you|u)\s*(''?re|are|r)\s+(so\s+|such\s+a?\s*)?(stupid|ugly|worthless|pathetic|useless|disgusting|a loser|an idiot|a waste)\y', 0.72),
  ('Harassment', 'harassment', '\y(shut up|idiot|loser|moron|bitch|bastard|dumb ?ass)\y', 0.62),
  ('Threat', 'threats', '\y(i''?ll|i will|i am going to|im going to|i''?m going to|gonna)\s+(kill|hurt|find|beat|stab|rape|ruin)\s+(you|u)\y', 0.90),
  ('Threat', 'threats', '\y(watch your back|i know where you live|you will regret this)\y', 0.84),
  ('Self-harm concern', 'self-harm', '\y(kill myself|end my life|want to die|wanna die|better off dead|no reason to live|cut myself|take my own life)\y', 0.82),
  ('Sexual solicitation', 'sexual', '\y(send (me )?nudes?|nude pics?|sex ?chat|sleep with me|hook ?up|have sex with me|horny)\y', 0.84),
  ('Scam / money', 'scam', '\y(send (me )?(money|cash|kes|ksh)|m-?pesa me|double your money|get rich|investment (opportunity|plan)|quick loan|loan for you)\y', 0.88),
  ('Scam / money', 'scam', '\y(kes|ksh|sh)\.?\s*\d{3,}\y', 0.58),
  ('Hate speech', 'hate', '\y(go back to your (country|tribe|village)|your tribe is|people like you should die)\y', 0.80)
) as v(c, r, p, k)
where not exists (select 1 from private.flag_rules);

-- The best rule that matches, or nothing. A second distinct match raises the confidence a little.
create or replace function private.score_text(p_text text) returns table (category text, reason text, confidence numeric)
language sql stable set search_path = ''
as $$
  with hit as (
    select r.category, r.reason, r.confidence from private.flag_rules r where r.enabled and lower(coalesce(p_text, '')) ~ r.pattern
  ), best as (
    select h.category, h.reason, h.confidence, (select count(*) from hit) as n from hit h order by h.confidence desc limit 1
  )
  select b.category, b.reason, least(0.99, b.confidence + 0.03 * (b.n - 1))::numeric from best b
$$;

-- Scores one piece of text and, when it matches, logs a flag and opens a case. At most one open flag per member and category an hour.
create or replace function private.flag_text(p_surface text, p_ref uuid, p_account uuid, p_text text, p_target text, p_conversation uuid, p_snapshot jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s record;
  fid bigint;
  rid uuid := gen_random_uuid();
  nm text;
  prior int;
begin
  if p_account is null then return; end if;
  select * into s from private.score_text(p_text);
  if s.category is null then return; end if;
  if exists (select 1 from private.flags f where f.account_id = p_account and f.category = s.category and f.outcome = 'open' and f.created_at > now() - interval '1 hour') then return; end if;
  select pen_name into nm from public.profiles where account_id = p_account;
  select count(*)::int into prior from private.reports where reported = p_account;
  insert into private.flags (category, confidence, surface, message_ref, account_id, report_id) values (s.category, s.confidence, p_surface, p_ref, p_account, rid)
    on conflict do nothing returning id into fid;
  if fid is null then return; end if;
  insert into private.reports (id, reporter, reported, reported_name, target, target_id, reason, note, conversation_id, snapshot, prior_reports, flag_id)
    values (rid, null, p_account, coalesce(nm, 'Reported member'), p_target, p_ref, s.reason, '', p_conversation, p_snapshot, prior, fid);
end;
$$;

create or replace function private.flag_chat_message() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  acct uuid;
  snap jsonb;
begin
  if new.kind <> 'text' or new.sender_member is null then return new; end if;
  select account_id into acct from public.conversation_members where id = new.sender_member;
  if not exists (select 1 from private.score_text(new.body)) then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', 'e' || (x.rn - 1), 'who', case when x.account_id = acct then 'reported' else 'reporter' end, 'text', left(x.body, 300), 'reported', x.id = new.id) order by x.created_at), '[]'::jsonb)
    into snap
    from (select row_number() over (order by m.created_at) as rn, m.id, m.body, m.created_at, cm.account_id
          from (select * from public.messages where conversation_id = new.conversation_id and kind = 'text' and created_at <= new.created_at order by created_at desc limit 6) m
          left join public.conversation_members cm on cm.id = m.sender_member) x;
  perform private.flag_text('chat', new.id, acct, new.body, 'message', new.conversation_id, snap);
  return new;
end;
$$;

create or replace function private.flag_group_message() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare snap jsonb;
begin
  if new.kind <> 'text' or new.account_id is null then return new; end if;
  if not exists (select 1 from private.score_text(new.body)) then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', 'e' || (x.rn - 1), 'who', case when x.id = new.id then 'reported' else 'reporter' end, 'text', left(coalesce(p.pen_name, 'Facilitator') || ': ' || x.body, 300), 'reported', x.id = new.id) order by x.created_at), '[]'::jsonb)
    into snap
    from (select row_number() over (order by m.created_at) as rn, m.* from (select * from private.group_messages where group_id = new.group_id and kind = 'text' and created_at <= new.created_at order by created_at desc limit 6) m) x
    left join public.profiles p on p.account_id = x.account_id;
  perform private.flag_text('group', new.id, new.account_id, new.body, 'message', null, snap);
  return new;
end;
$$;

create or replace function private.flag_comment() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.score_text(new.body)) then return new; end if;
  perform private.flag_text('forum', new.id, new.author_id, new.body, 'comment', null,
    jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reported', 'text', left(new.body, 300), 'reported', true)));
  return new;
end;
$$;

create or replace function private.flag_post() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from private.score_text(new.title || E'\n' || new.body)) then return new; end if;
  perform private.flag_text('forum', new.id, new.author_id, new.title || E'\n' || new.body, 'post', null,
    jsonb_build_array(jsonb_build_object('id', 'e0', 'who', 'reported', 'text', left(new.title || ': ' || new.body, 300), 'reported', true)));
  return new;
end;
$$;

create or replace trigger flag_chat_message after insert on public.messages for each row execute function private.flag_chat_message();
create or replace trigger flag_group_message after insert on private.group_messages for each row execute function private.flag_group_message();
create or replace trigger flag_comment after insert on private.comments for each row execute function private.flag_comment();
create or replace trigger flag_post after insert on private.posts for each row execute function private.flag_post();

-- A case that came from a flag says so, names the check as the reporter, and carries the flag's category, confidence and model.
select private.patch_function('private.cases_json(text)'::regprocedure,
  '''source'', ''user-report'', ''type'', private.reason_label\(r\.reason\),',
  '''source'', case when r.flag_id is null then ''user-report'' else ''ai-flag'' end, ''type'', private.reason_label(r.reason),', 'r.flag_id is null then');
select private.patch_function('private.cases_json(text)'::regprocedure,
  '''snapshotAt'', private\.ms\(r\.created_at\), ''ai'', null,',
  '''snapshotAt'', private.ms(r.created_at), ''ai'', (select jsonb_build_object(''category'', f.category, ''confidence'', f.confidence, ''model'', f.model) from private.flags f where f.id = r.flag_id),', 'from private.flags f where f.id = r.flag_id');
select private.patch_function('private.cases_json(text)'::regprocedure,
  'coalesce\(\(select p\.pen_name from public\.profiles p where p\.account_id = r\.reporter\), ''A member''\)',
  'case when r.flag_id is not null then ''Automated check'' else coalesce((select p.pen_name from public.profiles p where p.account_id = r.reporter), ''A member'') end', 'Automated check');

-- The decision on the case is the flag's outcome: dismissed means the flag was wrong, anything else means it was right. Escalating leaves it open.
select private.patch_function('public.admin_decide(text, text, text)'::regprocedure,
  'perform private\.staff_log\(s, case p_action when ''dismiss''',
  'if p_case like ''C-r:%'' and p_action <> ''escalate'' then update private.flags set outcome = case when p_action = ''dismiss'' then ''overturned'' else ''upheld'' end, reviewed_at = now() where report_id = substr(p_case, 5)::uuid and outcome = ''open''; end if;
  perform private.staff_log(s, case p_action when ''dismiss''', 'update private.flags set outcome');

create or replace function public.admin_flags() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.staff_can(s.role, 'work') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'flags', coalesce((
    select jsonb_agg(jsonb_build_object('id', 'F-' || (7000 + f.id), 'category', f.category, 'confidence', f.confidence::float8, 'model', f.model, 'outcome', f.outcome,
      'reviewMinutes', case when f.reviewed_at is null then null else greatest(0, round(extract(epoch from f.reviewed_at - f.created_at) / 60))::int end) order by f.id desc)
    from (select * from private.flags order by id desc limit 100) f), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_flags() from public, anon;
grant execute on function public.admin_flags() to authenticated;
