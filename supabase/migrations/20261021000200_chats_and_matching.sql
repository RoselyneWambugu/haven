-- Safe to run more than once. Paste the whole file into the Supabase SQL editor.
-- Echo backend, slice 2: peer matching and peer chat (matching, messages, blocking, reporting, 24-hour deletion).
-- Reading goes through my_chats(); every write goes through a function that checks the rules.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------- rules in one place
create or replace function private.chat_lifetime() returns interval language sql immutable set search_path = '' as $$ select interval '24 hours' $$;
create or replace function private.max_peer_chats() returns int language sql immutable set search_path = '' as $$ select 5 $$;
create or replace function private.rematch_cooldown() returns interval language sql immutable set search_path = '' as $$ select interval '30 days' $$;
create or replace function private.max_message_length() returns int language sql immutable set search_path = '' as $$ select 2000 $$;
-- The billing slice replaces this with a real plan check. Until then the app checks the plan on the device.
create or replace function private.has_plan(p_account uuid) returns boolean language sql stable set search_path = '' as $$ select true $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'peer' check (kind in ('peer', 'therapist')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  warned_at timestamptz,
  disappearing text not null default 'off' check (disappearing in ('off', 'proposed', 'on')),
  disappearing_by uuid,
  reported_at timestamptz,
  retained_at timestamptz
);
create index if not exists conversations_expiry_idx on public.conversations (expires_at);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  account_id uuid not null references auth.users (id) on delete cascade,
  muted boolean not null default false,
  archived boolean not null default false,
  hidden boolean not null default false,
  opened_at timestamptz,
  last_read_at timestamptz not null default now(),
  constraint conversation_members_unique unique (conversation_id, account_id)
);
create index if not exists conversation_members_account_idx on public.conversation_members (account_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_member uuid references public.conversation_members (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

create table if not exists private.match_queue (
  account_id uuid primary key references auth.users (id) on delete cascade,
  queued_at timestamptz not null default now(),
  matched_conversation_id uuid references public.conversations (id) on delete set null
);

-- Who has been paired with whom, kept after the chat is deleted, so the same two people aren't paired again too soon.
create table if not exists private.pair_history (
  a uuid not null references auth.users (id) on delete cascade,
  b uuid not null references auth.users (id) on delete cascade,
  paired_at timestamptz not null default now(),
  check (a < b)
);
create index if not exists pair_history_idx on private.pair_history (a, b, paired_at);

create table if not exists private.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  pen_name text not null,
  avatar public.avatar_kind not null,
  languages text[] not null default '{}',
  age_band public.age_band,
  created_at timestamptz not null default now(),
  unique (blocker, blocked)
);

-- Reports are for staff only. Nothing in the app can read them.
create table if not exists private.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references auth.users (id) on delete set null,
  reported uuid references auth.users (id) on delete set null,
  reported_name text,
  target text not null check (target in ('message', 'post', 'comment', 'member', 'session')),
  reason text not null,
  note text not null default '',
  conversation_id uuid references public.conversations (id) on delete set null,
  snapshot jsonb,
  prior_reports int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table private.match_queue enable row level security;
alter table private.pair_history enable row level security;
alter table private.blocks enable row level security;
alter table private.reports enable row level security;

drop policy if exists members_own on public.conversation_members;
create policy members_own on public.conversation_members for select to authenticated using (account_id = (select auth.uid()));
drop policy if exists conversations_member on public.conversations;
create policy conversations_member on public.conversations for select to authenticated using (
  exists (select 1 from public.conversation_members m where m.conversation_id = conversations.id and m.account_id = (select auth.uid()) and not m.hidden));
drop policy if exists messages_member on public.messages;
create policy messages_member on public.messages for select to authenticated using (
  exists (select 1 from public.conversation_members m where m.conversation_id = messages.conversation_id and m.account_id = (select auth.uid()) and not m.hidden));

revoke all on public.conversations, public.conversation_members, public.messages from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;

-- ---------------------------------------------------------------- the contact-details filter, checked again on the server
create or replace function private.blocked_reasons(p_input text) returns text[]
language plpgsql immutable set search_path = ''
as $$
declare
  t text := lower(regexp_replace(normalize(coalesce(p_input, ''), nfkc), '[​-‍﻿­]', '', 'g'));
  reasons text[] := '{}';
  toks text[];
  tok text;
  nxt text;
  cur text := '';
  spelled boolean := false;
  phone boolean := false;
  word text;
  dot text := '(\.|\s*\(dot\)\s*|\s*\[dot\]\s*|\s+dot\s+)';
  strong text := 'com|org|net|app|info|link|site|online|xyz|tv|africa|biz|store|shop|live|chat|today';
  weak text := 'me|co|io|ly|ke|gl|gg|cc|to|vc';
  platforms text := 'whatsapp|whats app|telegram|instagram|insta|snapchat|snap|facebook|fb|tiktok|signal|discord|wechat|twitter|x\.com|linkedin';
  verbs text := 'add|dm|pm|msg|message|text|call|contact|reach|find|follow|hit|ping|inbox|my|handle|number|username|user name|@';
  s text;
  i int;
  n int;
  addr text[] := array[
    '\yp\.?\s?o\.?\s?box\s*\d+',
    '\ypost(al)?\s+(box|code)\s*\d+',
    '\y(plot|house|apartment|apt|flat)\s*(no\.?|number|#)?\s*\d+[a-z]?\y',
    '\y\d{1,4}\s+[a-z]+(\s+[a-z]+)?\s+(street|st|road|rd|avenue|ave|lane|ln|drive|dr|close|crescent)\y',
    '\y(my|our)\s+address\s+(is|:)',
    '\yaddress\s*:',
    '\y(opposite|behind|next to|near)\s+(the\s+)?[a-z]+(\s+[a-z]+){0,2}\s+(petrol station|supermarket|school|church|mall|stage|hospital|police station|junction|estate|apartments?|gate)\y'];
begin
  -- Phone numbers, including spaced, spelled-out or disguised ones.
  toks := array(select x from unnest(regexp_split_to_array(t, '[^a-z0-9+]+')) x where x <> '');
  n := coalesce(array_length(toks, 1), 0);
  for i in 1 .. n + 1 loop
    tok := toks[i];
    nxt := toks[i + 1];
    word := null;
    if tok is not null then
      word := case tok
        when 'zero' then '0' when 'sifuri' then '0' when 'one' then '1' when 'moja' then '1' when 'two' then '2' when 'mbili' then '2'
        when 'three' then '3' when 'tatu' then '3' when 'four' then '4' when 'nne' then '4' when 'five' then '5' when 'tano' then '5'
        when 'six' then '6' when 'sita' then '6' when 'seven' then '7' when 'saba' then '7' when 'eight' then '8' when 'nane' then '8'
        when 'nine' then '9' when 'tisa' then '9' else null end;
    end if;
    if tok is not null and word is not null then
      cur := cur || word; spelled := true; continue;
    end if;
    if tok in ('o', 'oh') and (cur <> '' or coalesce(nxt, '') ~ '^\+?[0-9]' or coalesce(nxt, '') in ('zero','sifuri','one','moja','two','mbili','three','tatu','four','nne','five','tano','six','sita','seven','saba','eight','nane','nine','tisa')) then
      cur := cur || '0'; spelled := true; continue;
    end if;
    if tok is not null and tok ~ '^\+?[0-9o]+$' and tok ~ '[0-9]' then
      cur := cur || replace(replace(tok, 'o', '0'), '+', '');
      if tok ~ 'o' then spelled := true; end if;
      continue;
    end if;
    if cur <> '' then
      if cur ~ '^(254|0)?[17][0-9]{8}$' or length(cur) >= 10 or (spelled and length(cur) >= 7) then phone := true; end if;
    end if;
    cur := ''; spelled := false;
  end loop;
  if phone then reasons := array_append(reasons, 'phone'); end if;

  -- Links.
  if t ~ '(https?://|ftp://|www\.)'
     or t ~ ('[a-z0-9][a-z0-9-]{1,61}' || dot || '(' || strong || ')\y')
     or t ~ ('[a-z0-9][a-z0-9-]{1,61}' || dot || '(' || weak || ')(?=[/:?#])')
     or t ~ '\y(wa\.me|t\.me|bit\.ly|tinyurl\.com|linktr\.ee|youtu\.be)\y' then
    reasons := array_append(reasons, 'link');
  end if;

  -- Email addresses, including "name at gmail dot com".
  if t ~ '[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\s+dot\s+)\s*[a-z]{2,}'
     or t ~ '\y[a-z0-9._-]{3,}\s+at\s+(gmail|yahoo|outlook|hotmail|icloud|proton|protonmail)\y' then
    reasons := array_append(reasons, 'email');
  end if;

  -- Social handles and "add me on <platform>".
  if t ~ '(^|\s)@[a-z0-9_.]{3,}' then
    reasons := array_append(reasons, 'handle');
  elsif t ~ ('\y(' || platforms || ')\y') then
    foreach s in array regexp_split_to_array(t, '[.!?\n]+') loop
      if s ~ ('\y(' || platforms || ')\y') and s ~ ('(^|[^a-z])(' || verbs || ')([^a-z]|$)') then
        reasons := array_append(reasons, 'handle');
        exit;
      end if;
    end loop;
  end if;

  -- Addresses and landmarks.
  foreach s in array addr loop
    if t ~ s then reasons := array_append(reasons, 'address'); exit; end if;
  end loop;
  return reasons;
end;
$$;

create or replace function private.explain_block(p_reasons text[]) returns text
language plpgsql immutable set search_path = ''
as $$
declare parts text[] := '{}'; list text;
begin
  if 'phone' = any (p_reasons) then parts := array_append(parts, 'phone numbers'); end if;
  if p_reasons && array['link', 'handle', 'email'] then parts := array_append(parts, 'links and contact details'); end if;
  if 'address' = any (p_reasons) then parts := array_append(parts, 'addresses'); end if;
  list := case when cardinality(parts) = 0 then 'contact details' else array_to_string(parts, ', ') end;
  return upper(left(list, 1)) || substr(list, 2) || ' can’t be shared here. It keeps everyone anonymous.';
end;
$$;

-- ---------------------------------------------------------------- helpers
create or replace function private.open_chat_count(p_account uuid) returns int
language sql stable set search_path = ''
as $$
  select count(*)::int from public.conversation_members m join public.conversations c on c.id = m.conversation_id
  where m.account_id = p_account and not m.hidden and c.kind = 'peer' and c.ended_at is null and c.expires_at > now()
$$;

create or replace function private.say(p_conversation uuid, p_text text) returns void
language sql set search_path = ''
as $$ insert into public.messages (conversation_id, kind, body) values (p_conversation, 'system', p_text) $$;

-- Deletes chats that are 24 hours old (unless reported), adds an "ending soon" note an hour before. Reported chats are kept out of sight.
create or replace function private.sweep() returns void
language plpgsql set search_path = ''
as $$
begin
  with w as (
    update public.conversations c set warned_at = now()
    where c.warned_at is null and c.ended_at is null and c.expires_at > now() and c.expires_at - interval '1 hour' <= now()
    returning c.id)
  insert into public.messages (conversation_id, kind, body) select id, 'system', 'This chat ends in about an hour and will then be deleted.' from w;
  update public.conversation_members m set hidden = true
    from public.conversations c where c.id = m.conversation_id and c.expires_at <= now() and c.reported_at is not null and not m.hidden;
  update public.conversations set ended_at = coalesce(ended_at, now()), retained_at = coalesce(retained_at, now())
    where expires_at <= now() and reported_at is not null and retained_at is null;
  delete from public.conversations where expires_at <= now() and reported_at is null;
  delete from private.match_queue where queued_at < now() - interval '30 minutes';
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'echo-sweep-chats';
select cron.schedule('echo-sweep-chats', '* * * * *', 'select private.sweep()');

create or replace function private.cooldown_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from private.pair_history h where h.a = least(p_a, p_b) and h.b = greatest(p_a, p_b) and h.paired_at > now() - private.rematch_cooldown())
$$;

-- Looks for a partner for someone who is waiting. Same age range and a shared language first; a neighbouring age range if nobody fits.
create or replace function private.try_match(p_me uuid) returns uuid
language plpgsql set search_path = ''
as $$
declare
  me record;
  cand record;
  conv uuid;
  mine uuid;
  theirs uuid;
  bands public.age_band[] := enum_range(null::public.age_band);
  my_idx int;
begin
  select p.age_band, p.languages into me from public.profiles p where p.account_id = p_me;
  my_idx := array_position(bands, me.age_band);
  select q.account_id, p.age_band = me.age_band as exact into cand
    from private.match_queue q
    join public.profiles p on p.account_id = q.account_id
    join public.accounts a on a.account_id = q.account_id
    where q.account_id <> p_me and q.matched_conversation_id is null and q.queued_at > now() - interval '30 minutes'
      and a.standing <> 'paused' and p.open_to_chats and p.languages && me.languages
      and abs(array_position(bands, p.age_band) - my_idx) <= 1
      and not exists (select 1 from private.blocks b where (b.blocker = p_me and b.blocked = q.account_id) or (b.blocker = q.account_id and b.blocked = p_me))
      and not private.cooldown_blocked(p_me, q.account_id)
      and private.open_chat_count(q.account_id) < private.max_peer_chats()
      and private.has_plan(q.account_id)
    order by (p.age_band = me.age_band) desc, q.queued_at
    for update of q skip locked
    limit 1;
  if not found then return null; end if;

  insert into public.conversations (kind, expires_at) values ('peer', now() + private.chat_lifetime()) returning id into conv;
  insert into public.conversation_members (conversation_id, account_id) values (conv, p_me) returning id into mine;
  insert into public.conversation_members (conversation_id, account_id) values (conv, cand.account_id) returning id into theirs;
  perform private.say(conv, 'You’re matched. Say hello when you’re ready.');
  perform private.say(conv, 'Chats end and are deleted 24 hours after they start, unless one is reported.');
  insert into private.pair_history (a, b) values (least(p_me, cand.account_id), greatest(p_me, cand.account_id));
  update private.match_queue set matched_conversation_id = conv where account_id = cand.account_id;
  delete from private.match_queue where account_id = p_me;
  return conv;
end;
$$;

-- ---------------------------------------------------------------- matching
create or replace function private.match_reply(p_state text, p_conv uuid default null) returns jsonb
language sql immutable set search_path = ''
as $$ select jsonb_build_object('ok', true, 'state', p_state, 'conversation_id', p_conv) $$;

create or replace function public.start_matching() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  p public.profiles;
  a public.accounts;
  conv uuid;
begin
  perform private.sweep();
  select * into a from public.accounts where account_id = uid;
  select * into p from public.profiles where account_id = uid;
  if not found then return private.fail('no-account', 'Sign in first.'); end if;
  if a.standing = 'paused' then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Peer chat needs an active plan.'); end if;
  if not p.open_to_chats then return private.fail('paused-matching', 'Matching is paused. Turn on “Open to new chats” first.'); end if;
  if private.open_chat_count(uid) >= private.max_peer_chats() then
    return private.fail('chat-limit', format('You have %s chats open, which is the most at one time. End one, or wait for one to expire, to meet someone new.', private.max_peer_chats()));
  end if;
  delete from private.match_queue where account_id = uid;
  insert into private.match_queue (account_id) values (uid);
  conv := private.try_match(uid);
  return case when conv is null then private.match_reply('searching') else private.match_reply('found', conv) end;
end;
$$;

create or replace function public.match_status() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  q private.match_queue;
  conv uuid;
begin
  select * into q from private.match_queue where account_id = uid;
  if not found then return private.match_reply('idle'); end if;
  if q.matched_conversation_id is not null then
    delete from private.match_queue where account_id = uid;
    return private.match_reply('found', q.matched_conversation_id);
  end if;
  conv := private.try_match(uid);
  return case when conv is null then private.match_reply('searching') else private.match_reply('found', conv) end;
end;
$$;

create or replace function public.cancel_matching() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  delete from private.match_queue where account_id = uid and matched_conversation_id is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- reading
create or replace function public.my_chats() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  perform private.sweep();
  return jsonb_build_object(
    'ok', true,
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'member_id', me.id,
        'peer', (select jsonb_build_object('id', other.id, 'pen_name', pr.pen_name, 'avatar', pr.avatar, 'languages', pr.languages, 'age_band', pr.age_band)
                 from public.conversation_members other join public.profiles pr on pr.account_id = other.account_id
                 where other.conversation_id = c.id and other.account_id <> uid limit 1),
        'created_at', c.created_at, 'expires_at', c.expires_at, 'ended', c.ended_at is not null,
        'muted', me.muted, 'archived', me.archived,
        'disappearing', case when c.disappearing = 'proposed' then (case when c.disappearing_by = me.id then 'proposed-by-me' else 'proposed-by-them' end) else c.disappearing end,
        'unread', (select count(*) from public.messages x where x.conversation_id = c.id and x.kind = 'text' and x.sender_member is distinct from me.id and x.created_at > me.last_read_at)
                  + case when me.opened_at is null then 1 else 0 end,
        'last_at', coalesce((select max(x.created_at) from public.messages x where x.conversation_id = c.id), c.created_at),
        'messages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'from', case when x.kind = 'system' then 'system' when x.sender_member = me.id then 'me' else 'them' end, 'text', x.body, 'at', x.created_at) order by x.created_at)
                              from (select * from public.messages y where y.conversation_id = c.id order by y.created_at desc limit 300) x), '[]'::jsonb)
      ) order by c.created_at desc)
      from public.conversation_members me join public.conversations c on c.id = me.conversation_id
      where me.account_id = uid and not me.hidden and c.kind = 'peer'), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'pen_name', b.pen_name, 'avatar', b.avatar, 'languages', b.languages, 'age_band', b.age_band) order by b.created_at) from private.blocks b where b.blocker = uid), '[]'::jsonb),
    'match', (select private.match_reply(case when q.matched_conversation_id is not null then 'found' else 'searching' end, q.matched_conversation_id) from private.match_queue q where q.account_id = uid)
  );
end;
$$;

-- ---------------------------------------------------------------- writing
create or replace function private.my_open_chat(p_conversation uuid, p_account uuid) returns public.conversation_members
language plpgsql stable set search_path = ''
as $$
declare m public.conversation_members;
begin
  select * into m from public.conversation_members where conversation_id = p_conversation and account_id = p_account and not hidden;
  return m;
end;
$$;

create or replace function public.send_message(p_conversation uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  m public.conversation_members;
  c public.conversations;
  a public.accounts;
  t text := btrim(coalesce(p_text, ''));
  reasons text[];
  msg public.messages;
begin
  m := private.my_open_chat(p_conversation, uid);
  if m.id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  select * into c from public.conversations where id = p_conversation;
  if c.ended_at is not null then return private.fail('ended', 'This conversation has ended.'); end if;
  if c.expires_at <= now() then return private.fail('ended', 'This conversation has ended.'); end if;
  select * into a from public.accounts where account_id = uid;
  if a.standing = 'paused' then return private.fail('paused', 'Your account is paused.'); end if;
  if not private.has_plan(uid) then return private.fail('read-only', 'Your plan has ended, so chats are read-only.'); end if;
  if t = '' then return private.fail('empty', 'Write a message first.'); end if;
  if char_length(t) > private.max_message_length() then return private.fail('too-long', 'That message is too long. Try splitting it.'); end if;
  reasons := private.blocked_reasons(t);
  if cardinality(reasons) > 0 then return private.fail('blocked', private.explain_block(reasons)); end if;
  insert into public.messages (conversation_id, sender_member, body) values (p_conversation, m.id, t) returning * into msg;
  update public.conversation_members set last_read_at = msg.created_at where id = m.id;
  return jsonb_build_object('ok', true, 'message', jsonb_build_object('id', msg.id, 'from', 'me', 'text', msg.body, 'at', msg.created_at));
end;
$$;

create or replace function public.mark_read(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update public.conversation_members set last_read_at = clock_timestamp(), opened_at = coalesce(opened_at, now())
    where conversation_id = p_conversation and account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_chat_prefs(p_conversation uuid, p_muted boolean default null, p_archived boolean default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update public.conversation_members set muted = coalesce(p_muted, muted), archived = coalesce(p_archived, archived)
    where conversation_id = p_conversation and account_id = uid and not hidden;
  if not found then return private.fail('gone', 'That conversation is gone.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.end_conversation(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if (private.my_open_chat(p_conversation, uid)).id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  update public.conversations set ended_at = now() where id = p_conversation and ended_at is null;
  if found then perform private.say(p_conversation, 'This conversation has ended.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A disappearing chat needs both people to agree.
create or replace function public.propose_disappearing(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  m public.conversation_members;
  c public.conversations;
begin
  m := private.my_open_chat(p_conversation, uid);
  if m.id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  select * into c from public.conversations where id = p_conversation;
  if c.ended_at is not null then return private.fail('ended', 'This conversation has ended.'); end if;
  if c.disappearing = 'proposed' and c.disappearing_by <> m.id then
    update public.conversations set disappearing = 'on', disappearing_by = null where id = p_conversation;
    perform private.say(p_conversation, 'Disappearing chat is on. New messages disappear after 24 hours.');
  elsif c.disappearing = 'off' then
    update public.conversations set disappearing = 'proposed', disappearing_by = m.id where id = p_conversation;
    perform private.say(p_conversation, 'Disappearing chat was suggested. Waiting for the other person to agree.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.turn_off_disappearing(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if (private.my_open_chat(p_conversation, uid)).id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  update public.conversations set disappearing = 'off', disappearing_by = null where id = p_conversation and disappearing <> 'off';
  if found then perform private.say(p_conversation, 'Disappearing chat is off.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- reporting and blocking
create or replace function private.file_chat_report(p_reporter uuid, p_conversation uuid, p_reason text, p_note text) returns uuid
language plpgsql set search_path = ''
as $$
declare
  me public.conversation_members;
  other public.conversation_members;
  snap jsonb;
  prior int;
  rid uuid;
  other_name text;
begin
  select * into me from public.conversation_members where conversation_id = p_conversation and account_id = p_reporter;
  select * into other from public.conversation_members where conversation_id = p_conversation and account_id <> p_reporter limit 1;
  select pen_name into other_name from public.profiles where account_id = other.account_id;
  -- The last 10 spoken messages for context; the other person's last 3 are the reported ones.
  with last10 as (
    select x.*, row_number() over (order by x.created_at) rn
    from (select * from public.messages where conversation_id = p_conversation and kind = 'text' order by created_at desc limit 10) x),
  marked as (
    select l.*, count(*) filter (where l.sender_member is distinct from me.id) over (order by l.rn desc rows between unbounded preceding and current row) as theirs_from_end
    from last10 l)
  select coalesce(jsonb_agg(jsonb_build_object('id', 'e' || (m.rn - 1), 'who', case when m.sender_member = me.id then 'reporter' else 'reported' end,
           'text', left(m.body, 500) || case when length(m.body) > 500 then '…' else '' end,
           'reported', (m.sender_member is distinct from me.id and m.theirs_from_end <= 3)) order by m.rn), '[]'::jsonb)
    into snap from marked m;
  select count(*)::int into prior from private.reports where reported = other.account_id;
  insert into private.reports (reporter, reported, reported_name, target, reason, note, conversation_id, snapshot, prior_reports)
    values (p_reporter, other.account_id, other_name, 'message', p_reason, left(coalesce(p_note, ''), 1000), p_conversation, snap, prior) returning id into rid;
  update public.conversations set reported_at = coalesce(reported_at, now()) where id = p_conversation;
  return rid;
end;
$$;

create or replace function public.report_chat(p_conversation uuid, p_reason text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if p_reason not in ('harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate', 'other') then
    return private.fail('invalid', 'Choose a reason from the list.');
  end if;
  if (private.my_open_chat(p_conversation, uid)).id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  perform private.file_chat_report(uid, p_conversation, p_reason, p_note);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.block_peer(p_conversation uuid, p_also_report boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  other public.conversation_members;
  pr public.profiles;
begin
  if (private.my_open_chat(p_conversation, uid)).id is null then return private.fail('gone', 'That conversation is gone.'); end if;
  select * into other from public.conversation_members where conversation_id = p_conversation and account_id <> uid limit 1;
  select * into pr from public.profiles where account_id = other.account_id;
  if p_also_report then perform private.file_chat_report(uid, p_conversation, 'other', 'Blocked and reported from chat'); end if;
  insert into private.blocks (blocker, blocked, pen_name, avatar, languages, age_band) values (uid, other.account_id, pr.pen_name, pr.avatar, pr.languages, pr.age_band)
    on conflict (blocker, blocked) do nothing;
  update public.conversations set ended_at = coalesce(ended_at, now()) where id = p_conversation;
  perform private.say(p_conversation, 'This conversation has ended.');
  update public.conversation_members set hidden = true where conversation_id = p_conversation and account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unblock_peer(p_block uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  delete from private.blocks where id = p_block and blocker = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- permissions
do $$
declare f text;
begin
  for f in select unnest(array[
    'start_matching()', 'match_status()', 'cancel_matching()', 'my_chats()', 'send_message(uuid,text)', 'mark_read(uuid)',
    'set_chat_prefs(uuid,boolean,boolean)', 'end_conversation(uuid)', 'propose_disappearing(uuid)', 'turn_off_disappearing(uuid)',
    'report_chat(uuid,text,text)', 'block_peer(uuid,boolean)', 'unblock_peer(uuid)'])
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on all functions in schema private from public, anon, authenticated;

select 'chats and matching ready' as status, (select count(*) from cron.job where jobname = 'echo-sweep-chats') as cleanup_jobs;
