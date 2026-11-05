-- The therapist link screen also shows links made by email: how a therapist is linked, and a hint of the address.

create or replace function public.admin_therapist_links() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or not private.staff_can(s.role, 'verifyTherapists') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'links', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'linked', x.account_id is not null, 'pending', x.account_id is null and (x.link_phone is not null or x.link_email is not null),
      'tail', right(coalesce(x.phone, x.link_phone, ''), 3),
      'via', case when coalesce(x.phone, x.link_phone) is not null then 'phone' when coalesce(x.email, x.link_email) is not null then 'email' else 'phone' end,
      'hint', case when coalesce(x.email, x.link_email) is null then '' else left(split_part(coalesce(x.email, x.link_email), '@', 1), 2) || '…@' || split_part(coalesce(x.email, x.link_email), '@', 2) end) order by x.name)
    from (select t.*, (select u.phone from auth.users u where u.id = t.account_id) as phone, (select u.email from auth.users u where u.id = t.account_id) as email from private.therapists t) x), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_therapist_links() from public, anon;
grant execute on function public.admin_therapist_links() to authenticated;
