-- Gossip: a section of the community where members share the latest talk. It is one built-in room that needs no joining.
-- Names of real people are refused, and gossip takes reactions, not replies.
insert into private.spaces (id, name, sensitive) values ('gossip', 'Gossip', false)
  on conflict (id) do update set name = excluded.name, sensitive = excluded.sensitive;

create or replace function private.not_names() returns text[]
language sql immutable set search_path = ''
as $$ select array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'kenya', 'kenyan', 'kenyans', 'africa', 'african', 'nairobi', 'mombasa', 'kisumu', 'nakuru', 'eldoret', 'thika', 'kiambu', 'machakos', 'kitale', 'nyeri', 'meru', 'embu', 'garissa', 'malindi', 'naivasha', 'kakamega', 'kisii', 'kericho', 'bungoma', 'busia', 'siaya', 'migori', 'homa', 'narok', 'kajiado', 'lamu', 'diani', 'tanzania', 'uganda', 'rwanda', 'ethiopia', 'somalia', 'america', 'london', 'dubai', 'echo', 'god', 'jesus', 'allah', 'christmas', 'easter', 'ramadan', 'eid', 'swahili', 'kiswahili', 'sheng', 'english', 'kikuyu', 'luo', 'luhya', 'kamba', 'kalenjin', 'twitter', 'tiktok', 'instagram', 'facebook', 'whatsapp', 'youtube', 'netflix', 'google', 'telegram', 'snapchat', 'spotify', 'uber', 'bolt', 'safaricom', 'airtel', 'mpesa', 'equity', 'matatu', 'boda', 'nyama', 'ugali', 'chapo', 'sukuma', 'the', 'this', 'that', 'there', 'they', 'then', 'when', 'what', 'who', 'why', 'how', 'yes', 'but', 'and', 'ndio', 'hapana', 'sasa', 'pole', 'asante']::text[] $$;

-- Capitalised words in the middle of a sentence that are not on the safe list: most likely somebody's name. Same rule as the app.
create or replace function private.gossip_names(p_text text) returns text
language sql immutable set search_path = ''
as $$
  select string_agg(distinct m[2], ', ')
  from regexp_matches('. ' || coalesce(p_text, ''), '([.!?:;"“(]\s*|\n\s*)?\m([A-Z][a-z]{2,})\M', 'g') as m
  where m[1] is null and lower(m[2]) <> all (private.not_names())
$$;

select private.patch_function('public.create_post(text, text, text, text)'::regprocedure,
  $p$if not exists \(select 1 from private\.space_members where account_id = uid and space_id = p_space\) then return private\.fail\('not-joined', 'Join this space to post in it\.'\); end if;$p$,
  $p$if p_space <> 'gossip' and not exists (select 1 from private.space_members where account_id = uid and space_id = p_space) then return private.fail('not-joined', 'Join this space to post in it.'); end if;
    if p_space = 'gossip' and private.gossip_names(t || chr(10) || b) is not null then return private.fail('names', 'That looks like a name (' || private.gossip_names(t || chr(10) || b) || '). Leave names out, so nobody can be pointed at. Say a neighbour or someone at work instead.'); end if;$p$,
  'gossip_names');

select private.patch_function('public.add_comment(uuid, text)'::regprocedure,
  $p$if p\.status <> 'published' then return private\.fail\('pending', 'You can comment once the post is live\.'\); end if;$p$,
  $p$if p.status <> 'published' then return private.fail('pending', 'You can comment once the post is live.'); end if;
  if p.space_id = 'gossip' then return private.fail('gossip', 'Gossip takes reactions, not replies.'); end if;$p$,
  'Gossip takes reactions');

revoke all on all functions in schema private from public, anon, authenticated;
