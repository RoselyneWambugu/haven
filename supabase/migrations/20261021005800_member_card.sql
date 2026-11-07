-- A light card for a pen name: how long they have been here, to the month. No posts, gossip, chats or any other detail. Nothing here removes data.
create index if not exists profiles_public_key_idx on public.profiles (public_key);

create or replace function public.member_card(p_key text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  pr public.profiles;
begin
  if p_key is null or p_key !~ '^[0-9a-fA-F-]{36}$' then return private.fail('gone', 'This person isn’t here.'); end if;
  select * into pr from public.profiles where public_key = p_key::uuid;
  if not found or pr.account_id = uid then return private.fail('gone', 'This person isn’t here.'); end if;
  return jsonb_build_object('ok', true, 'since', (extract(epoch from date_trunc('month', pr.created_at)) * 1000)::bigint);
end;
$$;

-- Comments carry the same opaque key as posts, so a pen name on a comment can be tapped too.
select private.replace_in_function('public.forum_feed()'::regprocedure,
  '''therapist_id'', th.id,',
  '''author_key'', case when c.author_id = uid then ''me'' else cp.public_key::text end, ''therapist_id'', th.id,', 'c.author_id = uid then ''me''');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.member_card(text) from public, anon;
grant execute on function public.member_card(text) to authenticated;
