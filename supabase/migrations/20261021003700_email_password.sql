-- Email and password sign-in next to the phone code and Google. Supabase Auth does the passwords and the reset emails; this only tells the
-- app whether the account has a password, so the private-profile check can ask for it.

select private.patch_function('public.my_account()'::regprocedure,
  $p$'has_google', exists \(select 1 from auth\.identities ai where ai\.user_id = uid and ai\.provider = 'google'\),$p$,
  $p$'has_google', exists (select 1 from auth.identities ai where ai.user_id = uid and ai.provider = 'google'),
      'has_password', exists (select 1 from auth.identities ai where ai.user_id = uid and ai.provider = 'email'),$p$,
  'has_password');

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;
