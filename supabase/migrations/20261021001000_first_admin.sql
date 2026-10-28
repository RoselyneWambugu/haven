-- Creating the first Admin without SQL. While nobody is an active Admin, the first person to sign in with
-- the one-time setup code becomes an Admin. The code is stored hashed, works once, and locks after 5 wrong tries.

create table if not exists private.setup (
  id int primary key default 1 check (id = 1),
  code_hash text,
  attempts int not null default 0,
  used_at timestamptz
);
alter table private.setup enable row level security;

create or replace function public.setup_open() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  return jsonb_build_object('ok', true, 'open',
    private.active_admins() = 0
    and exists (select 1 from private.setup where code_hash is not null and used_at is null and attempts < 5));
end;
$$;

create or replace function public.claim_first_admin(p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  st private.setup;
  nm text := btrim(coalesce(p_name, ''));
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into st from private.setup where id = 1 for update;
  if not found or st.code_hash is null or st.used_at is not null or private.active_admins() > 0 then
    return private.fail('closed', 'Setup is closed. Ask an Admin to add you.');
  end if;
  if st.attempts >= 5 then return private.fail('locked', 'Too many wrong codes. Setup is locked.'); end if;
  if char_length(nm) < 3 or char_length(nm) > 30 then return private.fail('name', 'A name is 3 to 30 characters.'); end if;
  if encode(sha256(convert_to(code, 'utf8')), 'hex') <> st.code_hash then
    update private.setup set attempts = attempts + 1 where id = 1;
    return private.fail('code', 'That setup code doesn’t match.');
  end if;
  if exists (select 1 from private.therapists where account_id = uid) then return private.fail('taken', 'This number is linked to a therapist.'); end if;
  if exists (select 1 from private.staff where lower(name) = lower(nm) and account_id <> uid) then return private.fail('name', 'Someone with that name is already on the team.'); end if;
  insert into private.staff (account_id, name, role, active) values (uid, nm, 'admin', true)
    on conflict (account_id) do update set name = excluded.name, role = 'admin', active = true;
  update private.setup set used_at = now() where id = 1;
  insert into private.audit (actor, role, action, target, reason) values (nm, 'admin', 'Created the first Admin', nm, 'Setup code');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.setup_open(), public.claim_first_admin(text, text) from public, anon;
grant execute on function public.setup_open(), public.claim_first_admin(text, text) to authenticated;
