-- Decision (Q-46): no plan gives a discount on therapy sessions. The therapist's listed price is what the member pays, and the platform
-- fee stays one standing percentage for every therapist. The column stays so old data and the settings contract keep working, but it is
-- always zero and the checkout ignores it.

alter table private.plans alter column therapist_discount_pct set default 0;
update private.plans set therapist_discount_pct = 0 where therapist_discount_pct <> 0;

create or replace function private.therapy_discount_pct(p_account uuid) returns int
language sql stable set search_path = ''
as $$ select 0 $$;

revoke all on all functions in schema private from public, anon, authenticated;
