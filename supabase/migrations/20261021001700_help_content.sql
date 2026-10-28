-- Resources and help tickets on the server: help departments and articles, the urgent-help numbers, the support directory,
-- service suggestions, and members' help tickets with staff replies. Staff edit the content, and the member app reads it
-- from here, so a change shows up without a release. Nothing here uses delete or drop: lines are marked removed instead.

create table if not exists private.help_departments (
  id text primary key,
  title text not null,
  blurb text not null,
  icon text not null,
  owner text not null check (owner in ('Support', 'Billing', 'Moderation', 'Clinical', 'Tech')),
  sla_hours int not null default 24 check (sla_hours between 1 and 168),
  enabled boolean not null default true,
  sort int not null default 0
);
create table if not exists private.help_articles (
  id text primary key,
  dept_id text not null references private.help_departments (id),
  title text not null,
  intro text not null,
  steps jsonb not null default '[]'::jsonb,
  related jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  sort int not null default 0
);
create table if not exists private.help_crisis_lines (
  id text primary key,
  name text not null,
  phone text not null default '',
  hours text not null,
  languages text not null,
  removed boolean not null default false,
  sort int not null default 0
);
create table if not exists private.help_orgs (
  id text primary key,
  name text not null,
  type text not null check (type in ('Counselling', 'Helpline', 'Legal')),
  cost text not null default '',
  hours text not null default '',
  languages text not null default '',
  action text not null check (action in ('call', 'web', 'contact')),
  value text not null default '',
  archived boolean not null default false,
  sort int not null default 0
);
create table if not exists private.help_meta (
  id int primary key default 1 check (id = 1),
  popular jsonb not null default '[]'::jsonb,
  emergency jsonb not null,
  crisis_verified_at timestamptz
);
create table if not exists private.help_suggestions (
  id bigint generated always as identity primary key,
  name text not null,
  note text not null default '',
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
create table if not exists private.tickets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  dept_id text not null references private.help_departments (id),
  subject text not null,
  status text not null default 'open' check (status in ('open', 'replied', 'resolved')),
  unread boolean not null default false,
  routed_to_crisis boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tickets_account_idx on private.tickets (account_id, created_at desc);
create table if not exists private.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references private.tickets (id) on delete cascade,
  from_staff boolean not null default false,
  body text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists ticket_messages_idx on private.ticket_messages (ticket_id, created_at);

alter table private.help_departments enable row level security;
alter table private.help_articles enable row level security;
alter table private.help_crisis_lines enable row level security;
alter table private.help_orgs enable row level security;
alter table private.help_meta enable row level security;
alter table private.help_suggestions enable row level security;
alter table private.tickets enable row level security;
alter table private.ticket_messages enable row level security;

-- Which team's departments each role works on. Admin works on all of them.
create or replace function private.owns(p_role text, p_owner text) returns boolean
language sql immutable set search_path = ''
as $$
  select case p_role
    when 'moderator' then p_owner = 'Moderation'
    when 'clinical' then p_owner = 'Clinical'
    when 'billing' then p_owner in ('Support', 'Billing')
    when 'admin' then true
    else false end
$$;

-- What the member app shows. Open to anyone, signed in or not, because urgent help must always be reachable.
create or replace function public.help_content() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true,
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'blurb', d.blurb, 'icon', d.icon, 'owner', d.owner, 'slaHours', d.sla_hours, 'enabled', true) order by d.sort) from private.help_departments d where d.enabled), '[]'::jsonb),
    'articles', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'deptId', a.dept_id, 'title', a.title, 'intro', a.intro, 'steps', a.steps, 'related', a.related, 'updatedAt', private.ms(a.updated_at), 'published', true) order by a.sort)
                          from private.help_articles a join private.help_departments d on d.id = a.dept_id where a.published and d.enabled), '[]'::jsonb),
    'popular', (select popular from private.help_meta where id = 1),
    'emergency', (select emergency from private.help_meta where id = 1),
    'crisisLines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone, 'hours', l.hours, 'languages', l.languages) order by l.sort) from private.help_crisis_lines l where not l.removed), '[]'::jsonb),
    'supportOrgs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'type', o.type, 'cost', o.cost, 'hours', o.hours, 'languages', o.languages, 'action', o.action, 'value', o.value, 'archived', false) order by o.sort) from private.help_orgs o where not o.archived), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------- members' tickets

create or replace function private.tickets_json(p_account uuid) returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'deptId', t.dept_id, 'subject', t.subject, 'status', t.status, 'unread', t.unread,
      'createdAt', private.ms(t.created_at), 'routedToCrisis', t.routed_to_crisis,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', case when m.from_staff then 'staff' else 'me' end, 'text', m.body, 'at', private.ms(m.created_at)) order by m.created_at)
                            from private.ticket_messages m where m.ticket_id = t.id), '[]'::jsonb)) order by t.created_at desc), '[]'::jsonb)
  from private.tickets t where t.account_id = p_account
$$;

create or replace function public.my_tickets() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'tickets', private.tickets_json(uid));
end;
$$;

create or replace function public.create_ticket(p_dept text, p_subject text, p_text text, p_crisis boolean default false) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  sub text := btrim(coalesce(p_subject, ''));
  txt text := btrim(coalesce(p_text, ''));
  tid uuid;
begin
  if sub = '' then return private.fail('subject', 'Add a short subject.'); end if;
  if char_length(txt) < 10 then return private.fail('text', 'Tell us a little more so we can help.'); end if;
  if not exists (select 1 from private.help_departments where id = p_dept and enabled) then return private.fail('dept', 'Choose what this is about.'); end if;
  if (select count(*) from private.tickets where account_id = uid and created_at > now() - interval '1 day') >= 5 then
    return private.fail('limit', 'You have sent several requests today. We will reply to those first.');
  end if;
  insert into private.tickets (account_id, dept_id, subject, routed_to_crisis) values (uid, p_dept, left(sub, 140), coalesce(p_crisis, false)) returning id into tid;
  insert into private.ticket_messages (ticket_id, from_staff, body) values (tid, false, left(txt, 4000));
  return jsonb_build_object('ok', true, 'id', tid, 'crisis', coalesce(p_crisis, false));
end;
$$;

create or replace function public.reply_ticket(p_id uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  txt text := btrim(coalesce(p_text, ''));
begin
  if txt = '' then return private.fail('empty', 'Write a reply first.'); end if;
  update private.tickets set status = 'open' where id = p_id and account_id = uid;
  if not found then return private.fail('gone', 'We couldn’t find that request.'); end if;
  insert into private.ticket_messages (ticket_id, from_staff, body) values (p_id, false, left(txt, 4000));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_ticket_read(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.tickets set unread = false where id = p_id and account_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.resolve_ticket(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  update private.tickets set status = 'resolved', unread = false where id = p_id and account_id = uid;
  if not found then return private.fail('gone', 'We couldn’t find that request.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.suggest_service(p_name text, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  n text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 3 then return private.fail('invalid', 'Tell us the name of the service.'); end if;
  if (select count(*) from private.help_suggestions where created_at > now() - interval '1 day') >= 50 then return private.fail('limit', 'Thank you. We have a lot to review already.'); end if;
  insert into private.help_suggestions (name, note) values (left(n, 120), left(btrim(coalesce(p_note, '')), 300));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- what staff see

create or replace function public.admin_help() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true,
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'blurb', d.blurb, 'icon', d.icon, 'owner', d.owner, 'slaHours', d.sla_hours, 'enabled', d.enabled) order by d.sort) from private.help_departments d), '[]'::jsonb),
    'articles', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'deptId', a.dept_id, 'title', a.title, 'intro', a.intro, 'steps', a.steps, 'related', a.related, 'updatedAt', private.ms(a.updated_at), 'published', a.published) order by a.sort) from private.help_articles a), '[]'::jsonb),
    'popular', (select popular from private.help_meta where id = 1),
    'emergency', (select emergency from private.help_meta where id = 1),
    'crisisLines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone, 'hours', l.hours, 'languages', l.languages) order by l.sort) from private.help_crisis_lines l where not l.removed), '[]'::jsonb),
    'crisisVerifiedAt', (select case when crisis_verified_at is null then null else private.ms(crisis_verified_at) end from private.help_meta where id = 1),
    'supportOrgs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'type', o.type, 'cost', o.cost, 'hours', o.hours, 'languages', o.languages, 'action', o.action, 'value', o.value, 'archived', o.archived) order by o.sort) from private.help_orgs o), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('id', 'sg' || g.id, 'name', g.name, 'note', g.note, 'at', private.ms(g.created_at), 'status', g.status) order by g.created_at desc) from (select * from private.help_suggestions order by created_at desc limit 100) g), '[]'::jsonb),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'deptId', t.dept_id, 'subject', t.subject, 'status', t.status, 'unread', t.unread, 'createdAt', private.ms(t.created_at), 'routedToCrisis', t.routed_to_crisis,
        'penName', coalesce((select p.pen_name from public.profiles p where p.account_id = t.account_id), 'A member'),
        'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', case when m.from_staff then 'staff' else 'me' end, 'text', m.body, 'at', private.ms(m.created_at)) order by m.created_at) from private.ticket_messages m where m.ticket_id = t.id), '[]'::jsonb)) order by t.routed_to_crisis desc, t.created_at)
      from (select tt.* from private.tickets tt join private.help_departments d on d.id = tt.dept_id where private.owns(s.role, d.owner) and tt.status <> 'resolved' order by tt.created_at desc limit 200) t), '[]'::jsonb));
end;
$$;

create or replace function public.admin_reply_ticket(p_id uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.tickets;
  d private.help_departments;
  txt text := btrim(coalesce(p_text, ''));
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  select * into t from private.tickets where id = p_id for update;
  if not found then return private.fail('gone', 'Ticket not found.'); end if;
  select * into d from private.help_departments where id = t.dept_id;
  if not private.owns(s.role, d.owner) then return private.fail('role', 'Your role can’t answer tickets for this department.'); end if;
  if char_length(txt) < 3 then return private.fail('empty', 'Write a reply first.'); end if;
  insert into private.ticket_messages (ticket_id, from_staff, body) values (t.id, true, left(txt, 4000));
  update private.tickets set status = 'replied', unread = true where id = t.id;
  perform private.staff_log(s, 'Replied to ticket', 'T-' || left(t.id::text, 8), d.title);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_resolve_ticket(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t private.tickets;
  d private.help_departments;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  select * into t from private.tickets where id = p_id for update;
  if not found then return private.fail('gone', 'Ticket not found.'); end if;
  select * into d from private.help_departments where id = t.dept_id;
  if not private.owns(s.role, d.owner) then return private.fail('role', 'Your role can’t close tickets for this department.'); end if;
  update private.tickets set status = 'resolved', unread = true where id = t.id;
  perform private.staff_log(s, 'Resolved ticket', 'T-' || left(t.id::text, 8));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- editing the content

create or replace function public.admin_save_article(p_id text, p_dept text, p_title text, p_intro text, p_steps jsonb, p_published boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  d private.help_departments;
  ex private.help_articles;
  nid text;
  steps jsonb;
  t text := btrim(coalesce(p_title, ''));
  i text := btrim(coalesce(p_intro, ''));
  base text;
  n int := 2;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  select * into d from private.help_departments where id = p_dept;
  if not found or not private.owns(s.role, d.owner) then return private.fail('role', 'Your role can’t edit articles in this department.'); end if;
  if char_length(t) < 8 or char_length(t) > 90 then return private.fail('invalid', 'Give the article a title of 8 to 90 characters.'); end if;
  if char_length(i) < 10 then return private.fail('invalid', 'Add a short introduction.'); end if;
  select coalesce(jsonb_agg(btrim(x)), '[]'::jsonb) into steps from jsonb_array_elements_text(coalesce(p_steps, '[]'::jsonb)) x where btrim(x) <> '';
  if jsonb_array_length(steps) = 0 then return private.fail('invalid', 'Add at least one step.'); end if;
  if exists (select 1 from jsonb_array_elements_text(steps) x where char_length(x) < 5) then return private.fail('invalid', 'Each step needs a few words.'); end if;
  if p_id is not null and p_id <> '' then
    select * into ex from private.help_articles where id = p_id;
    if found then
      if not private.owns(s.role, (select owner from private.help_departments where id = ex.dept_id)) then return private.fail('role', 'Your role can’t edit this article.'); end if;
      update private.help_articles set dept_id = p_dept, title = t, intro = i, steps = steps, published = coalesce(p_published, published), updated_at = now() where id = p_id;
      perform private.staff_log(s, 'Edited article', p_id);
      return jsonb_build_object('ok', true, 'id', p_id);
    end if;
  end if;
  base := coalesce(nullif(left(regexp_replace(regexp_replace(lower(t), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'), 40), ''), 'article');
  nid := base;
  while exists (select 1 from private.help_articles where id = nid) loop nid := base || '-' || n; n := n + 1; end loop;
  insert into private.help_articles (id, dept_id, title, intro, steps, published, sort)
    values (nid, p_dept, t, i, steps, coalesce(p_published, true), (select coalesce(max(sort), 0) + 1 from private.help_articles));
  perform private.staff_log(s, 'Added article', nid);
  return jsonb_build_object('ok', true, 'id', nid);
end;
$$;

create or replace function public.admin_set_published(p_id text, p_published boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  a private.help_articles;
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  select * into a from private.help_articles where id = p_id;
  if not found then return private.fail('gone', 'Article not found.'); end if;
  if not private.owns(s.role, (select owner from private.help_departments where id = a.dept_id)) then return private.fail('role', 'Your role can’t change this article.'); end if;
  update private.help_articles set published = p_published, updated_at = now() where id = p_id;
  perform private.staff_log(s, case when p_published then 'Published article' else 'Unpublished article' end, p_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_department(p_id text, p_title text, p_blurb text, p_owner text, p_sla int, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  d private.help_departments;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change departments.'); end if;
  select * into d from private.help_departments where id = p_id;
  if not found then return private.fail('gone', 'Department not found.'); end if;
  if p_title is not null and char_length(btrim(p_title)) < 3 then return private.fail('invalid', 'A department needs a name.'); end if;
  if p_sla is not null and (p_sla < 1 or p_sla > 168) then return private.fail('invalid', 'A response target is 1 to 168 hours.'); end if;
  if p_owner is not null and p_owner not in ('Support', 'Billing', 'Moderation', 'Clinical', 'Tech') then return private.fail('invalid', 'Choose who owns it.'); end if;
  if p_enabled is false and p_id = 'safety' then return private.fail('locked', 'Safety and reporting can’t be switched off.'); end if;
  update private.help_departments set title = coalesce(btrim(p_title), title), blurb = coalesce(p_blurb, blurb), owner = coalesce(p_owner, owner), sla_hours = coalesce(p_sla, sla_hours), enabled = coalesce(p_enabled, enabled) where id = p_id;
  perform private.staff_log(s, 'Changed department', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_move_department(p_id text, p_dir int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  a private.help_departments;
  b private.help_departments;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change departments.'); end if;
  select * into a from private.help_departments where id = p_id;
  if not found then return private.fail('gone', 'Department not found.'); end if;
  if p_dir < 0 then select * into b from private.help_departments where sort < a.sort order by sort desc limit 1;
  else select * into b from private.help_departments where sort > a.sort order by sort limit 1; end if;
  if found then
    update private.help_departments set sort = b.sort where id = a.id;
    update private.help_departments set sort = a.sort where id = b.id;
  end if;
  perform private.staff_log(s, 'Reordered departments', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_crisis_line(p_id text, p_name text, p_phone text, p_hours text, p_languages text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  ph text := btrim(coalesce(p_phone, ''));
  lid text := nullif(btrim(coalesce(p_id, '')), '');
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Your role can’t edit crisis lines.'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then return private.fail('invalid', 'Add the name of the service.'); end if;
  if btrim(coalesce(p_hours, '')) = '' then return private.fail('invalid', 'Add when it is open.'); end if;
  if btrim(coalesce(p_languages, '')) = '' then return private.fail('invalid', 'Add the languages it works in.'); end if;
  if ph <> '' and (ph !~ '^[+0-9][0-9 -]{1,18}$' or length(regexp_replace(ph, '\D', '', 'g')) not between 3 and 15) then return private.fail('invalid', 'Use digits only, with an optional + at the start.'); end if;
  if lid is not null and exists (select 1 from private.help_crisis_lines where id = lid) then
    update private.help_crisis_lines set name = btrim(p_name), phone = ph, hours = btrim(p_hours), languages = btrim(p_languages), removed = false where id = lid;
  else
    lid := 'cl' || replace(gen_random_uuid()::text, '-', '');
    insert into private.help_crisis_lines (id, name, phone, hours, languages, sort) values (lid, btrim(p_name), ph, btrim(p_hours), btrim(p_languages), (select coalesce(max(sort), 0) + 1 from private.help_crisis_lines));
  end if;
  update private.help_meta set crisis_verified_at = null where id = 1;
  perform private.staff_log(s, 'Edited crisis line', btrim(p_name));
  return jsonb_build_object('ok', true, 'id', lid);
end;
$$;

create or replace function public.admin_remove_crisis_line(p_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Your role can’t edit crisis lines.'); end if;
  update private.help_crisis_lines set removed = true where id = p_id and not removed;
  if not found then return private.fail('gone', 'Line not found.'); end if;
  perform private.staff_log(s, 'Removed crisis line', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- A clinical reviewer confirms the numbers. They can't be confirmed while one is still blank. Editing a line clears this.
create or replace function public.admin_mark_verified() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Your role can’t verify crisis lines.'); end if;
  if btrim(coalesce((select emergency->>'phone' from private.help_meta where id = 1), '')) = '' or exists (select 1 from private.help_crisis_lines where not removed and btrim(phone) = '') then
    return private.fail('blank', 'Add every number before marking them as checked.');
  end if;
  update private.help_meta set crisis_verified_at = now() where id = 1;
  perform private.staff_log(s, 'Verified crisis lines', 'Urgent help');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_org(p_id text, p_name text, p_type text, p_cost text, p_hours text, p_languages text, p_action text, p_value text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  oid text := nullif(btrim(coalesce(p_id, '')), '');
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Your role can’t edit the directory.'); end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then return private.fail('invalid', 'Add the name of the organisation.'); end if;
  if p_type not in ('Counselling', 'Helpline', 'Legal') or p_action not in ('call', 'web', 'contact') then return private.fail('invalid', 'Choose a type and how to reach them.'); end if;
  if oid is not null and exists (select 1 from private.help_orgs where id = oid) then
    update private.help_orgs set name = btrim(p_name), type = p_type, cost = btrim(coalesce(p_cost, '')), hours = btrim(coalesce(p_hours, '')), languages = btrim(coalesce(p_languages, '')), action = p_action, value = btrim(coalesce(p_value, '')) where id = oid;
  else
    oid := 'o' || replace(gen_random_uuid()::text, '-', '');
    insert into private.help_orgs (id, name, type, cost, hours, languages, action, value, sort)
      values (oid, btrim(p_name), p_type, btrim(coalesce(p_cost, '')), btrim(coalesce(p_hours, '')), btrim(coalesce(p_languages, '')), p_action, btrim(coalesce(p_value, '')), (select coalesce(max(sort), 0) + 1 from private.help_orgs));
  end if;
  perform private.staff_log(s, 'Edited organisation', btrim(p_name));
  return jsonb_build_object('ok', true, 'id', oid);
end;
$$;

create or replace function public.admin_archive_org(p_id text, p_archived boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Your role can’t edit the directory.'); end if;
  update private.help_orgs set archived = p_archived where id = p_id;
  if not found then return private.fail('gone', 'Organisation not found.'); end if;
  perform private.staff_log(s, case when p_archived then 'Archived organisation' else 'Restored organisation' end, p_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_decide_suggestion(p_id text, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  g private.help_suggestions;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Your role can’t review suggestions.'); end if;
  select * into g from private.help_suggestions where id = nullif(regexp_replace(coalesce(p_id, ''), '\D', '', 'g'), '')::bigint for update;
  if not found or g.status <> 'new' then return private.fail('gone', 'This suggestion has been handled.'); end if;
  update private.help_suggestions set status = case when p_accept then 'accepted' else 'declined' end where id = g.id;
  -- An accepted suggestion joins the directory as archived, so a clinical reviewer fills in the details before it shows.
  if p_accept then
    insert into private.help_orgs (id, name, type, action, archived, sort)
      values ('o' || replace(gen_random_uuid()::text, '-', ''), g.name, 'Counselling', 'contact', true, (select coalesce(max(sort), 0) + 1 from private.help_orgs));
  end if;
  perform private.staff_log(s, case when p_accept then 'Accepted service suggestion' else 'Declined service suggestion' end, g.name);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.help_content() from public;
grant execute on function public.help_content() to anon, authenticated;
revoke execute on function public.my_tickets(), public.create_ticket(text, text, text, boolean), public.reply_ticket(uuid, text), public.mark_ticket_read(uuid), public.resolve_ticket(uuid),
  public.suggest_service(text, text), public.admin_help(), public.admin_reply_ticket(uuid, text), public.admin_resolve_ticket(uuid),
  public.admin_save_article(text, text, text, text, jsonb, boolean), public.admin_set_published(text, boolean),
  public.admin_save_department(text, text, text, text, int, boolean), public.admin_move_department(text, int),
  public.admin_save_crisis_line(text, text, text, text, text), public.admin_remove_crisis_line(text), public.admin_mark_verified(),
  public.admin_save_org(text, text, text, text, text, text, text, text), public.admin_archive_org(text, boolean), public.admin_decide_suggestion(text, boolean) from public, anon;
grant execute on function public.my_tickets(), public.create_ticket(text, text, text, boolean), public.reply_ticket(uuid, text), public.mark_ticket_read(uuid), public.resolve_ticket(uuid),
  public.suggest_service(text, text), public.admin_help(), public.admin_reply_ticket(uuid, text), public.admin_resolve_ticket(uuid),
  public.admin_save_article(text, text, text, text, jsonb, boolean), public.admin_set_published(text, boolean),
  public.admin_save_department(text, text, text, text, int, boolean), public.admin_move_department(text, int),
  public.admin_save_crisis_line(text, text, text, text, text), public.admin_remove_crisis_line(text), public.admin_mark_verified(),
  public.admin_save_org(text, text, text, text, text, text, text, text), public.admin_archive_org(text, boolean), public.admin_decide_suggestion(text, boolean) to authenticated;
