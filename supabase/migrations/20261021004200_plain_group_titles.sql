-- A group chat title says what the hour feels like, in everyday words. Clinical terms belong in the description, not the title.
create or replace function private.clinical_title_words(p_title text) returns text
language sql immutable set search_path = ''
as $$
  select string_agg(distinct lower(m[1]), ', ')
  from regexp_matches(p_title, '\m(disorders?|ptsd|cbt|dbt|therapy|treatment|symptoms?|diagnosis|diagnosed|clinical|psychiatric|pathology|adhd|ocd|bipolar|schizophrenia|cognitive|behavioural|behavioral|intervention|patients)\M', 'gi') as m;
$$;

select private.patch_function('public.admin_schedule_group(text, text, text, timestamptz, integer, integer)'::regprocedure,
  $p$if char_length\(tp\) > 90 then return private.fail\('invalid', 'Keep the topic under 90 characters.'\); end if;$p$,
  $p$if char_length(tp) > 90 then return private.fail('invalid', 'Keep the topic under 90 characters.'); end if;
  if private.clinical_title_words(tp) is not null then return private.fail('invalid', 'Use plainer words in the title (“' || private.clinical_title_words(tp) || '” sounds clinical). Say what the hour feels like; the description can be more exact.'); end if;$p$,
  'clinical_title_words');

select private.patch_function('public.admin_edit_group(text, text, text, timestamptz, integer, integer)'::regprocedure,
  $p$if char_length\(tp\) > 90 then return private.fail\('invalid', 'Keep the topic under 90 characters.'\); end if;$p$,
  $p$if char_length(tp) > 90 then return private.fail('invalid', 'Keep the topic under 90 characters.'); end if;
  if private.clinical_title_words(tp) is not null then return private.fail('invalid', 'Use plainer words in the title (“' || private.clinical_title_words(tp) || '” sounds clinical). Say what the hour feels like; the description can be more exact.'); end if;$p$,
  'clinical_title_words');

revoke all on all functions in schema private from public, anon, authenticated;
