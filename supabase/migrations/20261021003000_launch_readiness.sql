-- Launch readiness. Indexes for every foreign key that lacked one, and a checklist for Admins that reads the live system.

-- Foreign keys without an index slow deletes and joins as tables grow. This adds one for each that lacks it, in the private and public schemas.
do $$
declare
  c record;
  cols text;
begin
  for c in
    select con.conrelid, con.conname, con.conkey, cls.relname, nsp.nspname
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
     where con.contype = 'f' and nsp.nspname in ('private', 'public')
       and not exists (
         select 1 from pg_index i
          where i.indrelid = con.conrelid and i.indisvalid
            and (i.indkey::int2[])[0:array_length(con.conkey, 1) - 1] = con.conkey)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord) into cols
      from unnest(c.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum;
    execute format('create index if not exists %I on %I.%I (%s)', left('fk_' || c.relname || '_' || c.conname, 63), c.nspname, c.relname, cols);
  end loop;
end;
$$;

create table if not exists private.launch_signoffs (
  item text primary key,
  done boolean not null default true,
  done_by text not null,
  note text not null default '',
  at timestamptz not null default now()
);
alter table private.launch_signoffs enable row level security;

-- Things only a person can confirm, because the system can't see them.
create or replace function private.launch_manual_items() returns table (id text, label text)
language sql immutable set search_path = ''
as $$ values
  ('mpesa', 'M-Pesa is switched on with live (production) credentials and one real payment has been made and refunded'),
  ('sms', 'Africa''s Talking is switched on, the Send SMS hook is enabled, and a real sign-in code has arrived on a phone'),
  ('backups', 'Daily backups are on (and point-in-time recovery, if the plan allows), and a restore has been tried once'),
  ('legal', 'The privacy notice, terms and therapist code of conduct have been reviewed by counsel and are published'),
  ('domain', 'The production web address has a certificate, and the app builds point at the production project'),
  ('crisis-team', 'A named person owns the crisis line list and the 90 day re-check'),
  ('smoke', 'A full walk-through on a real phone has been done: sign up, pay, match, chat, book, report, delete account')
$$;

create or replace function public.admin_launch() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  items jsonb := '[]'::jsonb;
  n int;
  m record;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin sees the launch checklist.'); end if;

  -- crisis lines
  select count(*) into n from private.help_crisis_lines where not removed and (btrim(phone) = '' or name like '%___%');
  items := items || jsonb_build_object('id', 'crisis-lines', 'group', 'Safety', 'label', 'Every crisis line has a real name and phone number',
    'state', case when n = 0 and exists (select 1 from private.help_crisis_lines where not removed) then 'ok' else 'todo' end,
    'detail', case when n = 0 then '' else n || ' still ' || case when n = 1 then 'has' else 'have' end || ' a placeholder name or no number. Edit them in Resources.' end);
  items := items || jsonb_build_object('id', 'crisis-verified', 'group', 'Safety', 'label', 'The crisis lines were checked in the last 90 days',
    'state', case when (select crisis_verified_at from private.help_meta where id = 1) > now() - interval '90 days' then 'ok' else 'todo' end,
    'detail', coalesce((select 'Last checked ' || to_char(crisis_verified_at, 'DD Mon YYYY') from private.help_meta where id = 1 and crisis_verified_at is not null), 'Never checked. Call each number, then press “Mark as checked” in Resources.'));
  select count(*) into n from private.help_orgs where not archived and (btrim(value) = '' or name like '%___%');
  items := items || jsonb_build_object('id', 'support-orgs', 'group', 'Safety', 'label', 'Support organisations have real names and contact details',
    'state', case when n = 0 then 'ok' else 'todo' end, 'detail', case when n = 0 then '' else n || ' still ' || case when n = 1 then 'has' else 'have' end || ' a placeholder. Edit or archive them in Resources.' end);

  -- team
  select count(*) into n from private.staff where role = 'admin' and active;
  items := items || jsonb_build_object('id', 'admins', 'group', 'Team', 'label', 'At least two active Admins, so every change has a second approver',
    'state', case when n >= 2 then 'ok' else 'todo' end, 'detail', n || ' active ' || case when n = 1 then 'Admin' else 'Admins' end || '.');
  select count(*) into n from private.staff where role = 'clinical' and active;
  items := items || jsonb_build_object('id', 'clinical', 'group', 'Team', 'label', 'At least two active clinical reviewers, so no appeal is reviewed by the person who decided it',
    'state', case when n >= 2 then 'ok' else 'todo' end, 'detail', n || ' active.');
  select count(*) into n from private.staff where role = 'moderator' and active;
  items := items || jsonb_build_object('id', 'moderators', 'group', 'Team', 'label', 'At least two moderators, so there is cover for the heavy queue',
    'state', case when n >= 2 then 'ok' else 'todo' end, 'detail', n || ' active.');

  -- money
  select count(*) into n from private.plans where enabled and price_kes is null;
  items := items || jsonb_build_object('id', 'prices', 'group', 'Money', 'label', 'Every plan on offer has a price',
    'state', case when n = 0 and exists (select 1 from private.plans where enabled) then 'ok' else 'todo' end, 'detail', case when n = 0 then '' else n || ' offered without a price. Set them in Configuration.' end);
  select count(*) into n from private.payment_test_phones;
  items := items || jsonb_build_object('id', 'test-phones', 'group', 'Money', 'label', 'No test numbers can skip paying',
    'state', case when n = 0 then 'ok' else 'todo' end, 'detail', case when n = 0 then '' else n || ' test ' || case when n = 1 then 'number is' else 'numbers are' end || ' on the list that can complete a payment without paying.' end);
  items := items || jsonb_build_object('id', 'fee', 'group', 'Money', 'label', 'The platform fee is the one you intend (' || private.platform_fee_pct() || '%)',
    'state', 'ok', 'detail', 'Change it under Configuration if not.');

  -- jobs
  select count(*) into n from cron.job where jobname in ('echo-tick-groups', 'echo-tick-licences', 'echo-sms') and active;
  items := items || jsonb_build_object('id', 'jobs', 'group', 'Background jobs', 'label', 'The scheduled jobs for group chats, licences and texts are running',
    'state', case when n = 3 then 'ok' else 'todo' end, 'detail', n || ' of 3 running.');
  select count(*) into n from cron.job where jobname in ('echo-sweep-groups', 'echo-sweep-accounts') and active;
  items := items || jsonb_build_object('id', 'cleanup', 'group', 'Background jobs', 'label', 'The deleting jobs have been installed (group chats after 24 hours, accounts after the holding period)',
    'state', case when n = 2 then 'ok' else 'todo' end, 'detail', case when n = 2 then '' else 'Run supabase/group_chat_cleanup.sql and supabase/account_deletion_cleanup.sql in the SQL editor. ' || n || ' of 2 installed.' end);
  items := items || jsonb_build_object('id', 'sms-token', 'group', 'Background jobs', 'label', 'The text-sending job has its secret',
    'state', case when exists (select 1 from vault.secrets where name = 'sms_drain_token') then 'ok' else 'todo' end, 'detail', 'Needed to send reminders. See docs/BACKEND.md, SMS.');

  -- content
  select count(*) into n from private.therapists t where not t.suspended and not t.paused and t.accepting_new and t.licence_valid_to >= private.today();
  items := items || jsonb_build_object('id', 'therapists', 'group', 'Content', 'label', 'At least three verified therapists are accepting new clients',
    'state', case when n >= 3 then 'ok' else 'todo' end, 'detail', n || ' accepting now.');
  select count(*) into n from private.help_articles where published;
  items := items || jsonb_build_object('id', 'articles', 'group', 'Content', 'label', 'Help articles are published',
    'state', case when n >= 5 then 'ok' else 'todo' end, 'detail', n || ' published.');

  -- sign-offs a person gives
  for m in select * from private.launch_manual_items() loop
    items := items || jsonb_build_object('id', m.id, 'group', 'Confirm by hand', 'label', m.label, 'manual', true,
      'state', case when exists (select 1 from private.launch_signoffs where item = m.id and done) then 'ok' else 'todo' end,
      'detail', coalesce((select 'Confirmed by ' || done_by || ' on ' || to_char(at, 'DD Mon YYYY') || case when note <> '' then ': ' || note else '' end from private.launch_signoffs where item = m.id and done), ''));
  end loop;

  return jsonb_build_object('ok', true, 'items', items,
    'ready', not exists (select 1 from jsonb_array_elements(items) x where x->>'state' <> 'ok'));
end;
$$;

create or replace function public.admin_launch_signoff(p_item text, p_done boolean, p_note text default '') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Only an Admin confirms launch items.'); end if;
  if not exists (select 1 from private.launch_manual_items() m where m.id = p_item) then return private.fail('item', 'That isn’t an item to confirm by hand.'); end if;
  if p_done and char_length(btrim(coalesce(p_note, ''))) < 3 then return private.fail('note', 'Say how you checked, in a few words.'); end if;
  insert into private.launch_signoffs (item, done, done_by, note) values (p_item, coalesce(p_done, true), s.name, left(btrim(coalesce(p_note, '')), 300))
    on conflict (item) do update set done = excluded.done, done_by = excluded.done_by, note = excluded.note, at = now();
  perform private.staff_log(s, case when p_done then 'Confirmed launch item' else 'Reopened launch item' end, p_item, left(btrim(coalesce(p_note, '')), 300));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_launch(), public.admin_launch_signoff(text, boolean, text) from public, anon;
grant execute on function public.admin_launch(), public.admin_launch_signoff(text, boolean, text) to authenticated;
