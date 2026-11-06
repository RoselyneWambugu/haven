-- The languages members and therapists can choose are a list an Admin controls. For now it is English and Kiswahili; an Admin can add more
-- in Configuration, and each addition is logged. The rules that check a chosen language read this list.

create table if not exists private.languages (
  name text primary key,
  sort int not null default 0
);
insert into private.languages (name, sort) values ('English', 1), ('Kiswahili', 2) on conflict (name) do nothing;
alter table private.languages enable row level security;

create or replace function private.allowed_languages() returns text[]
language sql stable set search_path = ''
as $$ select coalesce(array_agg(name order by sort), '{}') from private.languages $$;

-- Members and therapists who had chosen a language that is no longer on the list keep only the ones that are, or English if none is left.
update public.profiles set languages = coalesce((select array_agg(l) from unnest(languages) l where l = any (private.allowed_languages())), array['English']::text[])
  where not (languages <@ private.allowed_languages());
update private.therapists set languages = coalesce((select array_agg(l) from unnest(languages) l where l = any (private.allowed_languages())), array['English']::text[])
  where not (languages <@ private.allowed_languages());

-- Members read the list with the rest of the app's settings, and Admins read it in Configuration.
do $do$
declare
  f text;
  def text;
  new_def text;
begin
  foreach f in array array['public.app_config()', 'public.admin_config()'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('''languages''' in def) > 0 then continue; end if;
    new_def := replace(def, '''topics'', coalesce((select jsonb_agg(name order by sort) from private.topics where not retired), ''[]''::jsonb),',
      '''topics'', coalesce((select jsonb_agg(name order by sort) from private.topics where not retired), ''[]''::jsonb), ''languages'', coalesce((select jsonb_agg(name order by sort) from private.languages), ''[]''::jsonb),');
    if new_def = def then raise exception 'patch did not apply to %', f; end if;
    execute new_def;
  end loop;
end;
$do$;

create or replace function public.admin_add_language(p_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  n text := btrim(coalesce(p_name, ''));
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change languages.'); end if;
  if char_length(n) < 3 or char_length(n) > 20 then return private.fail('invalid', 'A language name is 3 to 20 characters.'); end if;
  if n !~ '^[A-Z][A-Za-z]*([ -][A-Za-z]+)*$' then return private.fail('invalid', 'Start with a capital letter and use letters only, like Kikuyu.'); end if;
  if exists (select 1 from private.languages where lower(name) = lower(n)) then return private.fail('invalid', 'That language is already on the list.'); end if;
  if (select count(*) from private.languages) >= 20 then return private.fail('invalid', 'The list can hold up to 20 languages.'); end if;
  insert into private.languages (name, sort) values (n, (select coalesce(max(sort), 0) + 1 from private.languages));
  perform private.staff_log(s, 'Added language', n);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_add_language(text) from public, anon;
grant execute on function public.admin_add_language(text) to authenticated;
