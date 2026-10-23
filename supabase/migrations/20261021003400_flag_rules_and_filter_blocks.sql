-- Staff manage the automated flag rules, and every message the contact filter stops is counted. Nothing here uses delete or drop:
-- a rule is switched off, not removed.

create table if not exists private.filter_blocks (
  id bigint generated always as identity primary key,
  account_id uuid references auth.users (id) on delete set null,
  reasons text[] not null,
  created_at timestamptz not null default now()
);
create index if not exists filter_blocks_created_idx on private.filter_blocks (created_at desc);
alter table private.filter_blocks enable row level security;

-- Every place that stops a message goes through explain_block, so counting here counts them all. Only the kind of detail is kept, never the text.
create or replace function private.explain_block(p_reasons text[]) returns text
language plpgsql volatile set search_path = ''
as $$
declare parts text[] := '{}'; list text;
begin
  insert into private.filter_blocks (account_id, reasons) values ((select auth.uid()), coalesce(p_reasons, '{}'));
  if 'phone' = any (p_reasons) then parts := array_append(parts, 'phone numbers'); end if;
  if p_reasons && array['link', 'handle', 'email'] then parts := array_append(parts, 'links and contact details'); end if;
  if 'address' = any (p_reasons) then parts := array_append(parts, 'addresses'); end if;
  list := case when cardinality(parts) = 0 then 'contact details' else array_to_string(parts, ', ') end;
  return upper(left(list, 1)) || substr(list, 2) || ' can’t be shared here. It keeps everyone anonymous.';
end;
$$;

create or replace function public.admin_flag_rules() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true,
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'category', r.category, 'reason', r.reason, 'pattern', r.pattern, 'confidence', r.confidence::float8, 'enabled', r.enabled) order by r.category, r.id) from private.flag_rules r), '[]'::jsonb),
    'blocked24h', (select count(*) from private.filter_blocks where created_at > now() - interval '24 hours'),
    'blocked7d', (select count(*) from private.filter_blocks where created_at > now() - interval '7 days'),
    'blockedByKind', jsonb_build_object(
      'phone', (select count(*) from private.filter_blocks where created_at > now() - interval '7 days' and 'phone' = any (reasons)),
      'link', (select count(*) from private.filter_blocks where created_at > now() - interval '7 days' and reasons && array['link', 'handle', 'email']),
      'address', (select count(*) from private.filter_blocks where created_at > now() - interval '7 days' and 'address' = any (reasons))));
end;
$$;

-- Adds a rule (p_id null) or changes one. Rules can be switched off but not removed, so past flags still make sense.
create or replace function public.admin_save_flag_rule(p_id int, p_category text, p_reason text, p_pattern text, p_confidence numeric, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  cat text := btrim(coalesce(p_category, ''));
  pat text := btrim(coalesce(p_pattern, ''));
  rid int;
  ordinary text[] := array['hello', 'hello there', 'thank you', 'thanks', 'how are you', 'i hear you', 'good morning', 'take care', 'that sounds really hard', 'i am here for you'];
  w text;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins change the flag rules.'); end if;
  if char_length(cat) < 3 or char_length(cat) > 40 then return private.fail('category', 'Give the category a name of 3 to 40 characters.'); end if;
  if p_reason not in ('harassment', 'threats', 'self-harm', 'sexual', 'scam', 'hate') then return private.fail('reason', 'Choose what kind of case it opens.'); end if;
  if p_confidence is null or p_confidence < 0.30 or p_confidence > 0.99 then return private.fail('confidence', 'Confidence is between 0.30 and 0.99.'); end if;
  if char_length(pat) < 4 or char_length(pat) > 400 then return private.fail('pattern', 'The pattern is 4 to 400 characters.'); end if;
  begin
    perform '' ~ pat;
  exception when others then
    return private.fail('pattern', 'That isn’t a valid pattern.');
  end;
  if '' ~ pat then return private.fail('pattern', 'That pattern matches everything. Make it more specific.'); end if;
  foreach w in array ordinary loop
    if w ~ pat then return private.fail('pattern', 'That pattern would flag ordinary kind words (“' || w || '”). Make it more specific.'); end if;
  end loop;
  if p_id is null then
    insert into private.flag_rules (category, reason, pattern, confidence, enabled) values (cat, p_reason, pat, p_confidence, coalesce(p_enabled, true)) returning id into rid;
    perform private.staff_log(s, 'Added a flag rule', cat, pat);
  else
    update private.flag_rules set category = cat, reason = p_reason, pattern = pat, confidence = p_confidence, enabled = coalesce(p_enabled, true) where id = p_id returning id into rid;
    if rid is null then return private.fail('gone', 'That rule isn’t here.'); end if;
    perform private.staff_log(s, case when coalesce(p_enabled, true) then 'Changed a flag rule' else 'Switched off a flag rule' end, cat, pat);
  end if;
  return jsonb_build_object('ok', true, 'id', rid);
end;
$$;

-- Try some words against the live rules. Nothing is stored.
create or replace function public.admin_test_flag_text(p_text text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  m record;
begin
  if s.account_id is null or s.role not in ('moderator', 'clinical', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  select * into m from private.score_text(left(coalesce(p_text, ''), 2000));
  if m.category is null then return jsonb_build_object('ok', true, 'flagged', false); end if;
  return jsonb_build_object('ok', true, 'flagged', true, 'category', m.category, 'confidence', m.confidence::float8, 'reason', m.reason);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_flag_rules(), public.admin_save_flag_rule(int, text, text, text, numeric, boolean), public.admin_test_flag_text(text) from public, anon;
grant execute on function public.admin_flag_rules(), public.admin_save_flag_rule(int, text, text, text, numeric, boolean), public.admin_test_flag_text(text) to authenticated;
