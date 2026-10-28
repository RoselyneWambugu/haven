-- Break-glass access to a member's private details (name, phone, place). A moderator or Admin asks, giving a reason and a
-- justification; a clinical reviewer who is not the requester approves; the details can then be opened for 30 minutes by the
-- requester only. Every request, decision and viewing is logged. The member is not told.

create table if not exists private.break_glass (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  target uuid not null references auth.users (id) on delete cascade,
  target_name text not null,
  reason_code text not null check (reason_code in ('imminent-risk', 'legal', 'fraud')),
  justification text not null,
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_name text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired')),
  approved_by text,
  decided_at timestamptz,
  expires_at timestamptz
);
alter table private.break_glass enable row level security;

create or replace function private.expire_break_glass() returns void
language sql set search_path = ''
as $$
  update private.break_glass set status = 'expired', decided_at = coalesce(decided_at, now())
  where (status = 'pending' and requested_at < now() - interval '1 hour') or (status = 'approved' and expires_at < now())
$$;

create or replace function public.admin_request_break_glass(p_case text, p_reason text, p_justification text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  r private.reports;
  nm text;
  j text := btrim(coalesce(p_justification, ''));
  rid uuid;
begin
  if s.account_id is null or s.role not in ('moderator', 'admin') then return private.fail('role', 'Only moderators and Admins request this. A clinical reviewer approves it.'); end if;
  if p_case not like 'C-r:%' or not private.case_exists(p_case, s.role) then return private.fail('gone', 'Case not found.'); end if;
  if p_reason not in ('imminent-risk', 'legal', 'fraud') then return private.fail('reason', 'Choose a reason.'); end if;
  if char_length(j) < 15 then return private.fail('justification', 'Explain why this is necessary, in a sentence or two.'); end if;
  select * into r from private.reports where id = substr(p_case, 5)::uuid;
  if r.reported is null then return private.fail('gone', 'There is no member on this case.'); end if;
  perform private.expire_break_glass();
  if exists (select 1 from private.break_glass where case_id = p_case and status in ('pending', 'approved')) then
    return private.fail('open', 'There is already a request for this case.');
  end if;
  nm := coalesce(r.reported_name, 'Reported member');
  insert into private.break_glass (case_id, target, target_name, reason_code, justification, requested_by, requested_name)
    values (p_case, r.reported, nm, p_reason, left(j, 2000), s.account_id, s.name) returning id into rid;
  perform private.staff_log(s, 'Break-glass requested', nm, p_reason);
  return jsonb_build_object('ok', true, 'id', rid);
end;
$$;

create or replace function public.admin_decide_break_glass(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  b private.break_glass;
begin
  if s.account_id is null or s.role <> 'clinical' then return private.fail('second-person', 'A second person must approve this: the on-call clinical lead, not the requester.'); end if;
  perform private.expire_break_glass();
  select * into b from private.break_glass where id = p_id for update;
  if not found or b.status <> 'pending' then return private.fail('gone', 'This request has already been handled.'); end if;
  if b.requested_by = s.account_id then return private.fail('second-person', 'A second person must approve this: the on-call clinical lead, not the requester.'); end if;
  update private.break_glass set status = case when p_approve then 'approved' else 'declined' end, approved_by = s.name, decided_at = now(),
    expires_at = case when p_approve then now() + interval '30 minutes' end where id = b.id;
  perform private.staff_log(s, case when p_approve then 'Break-glass approved' else 'Break-glass declined' end, b.target_name, case when p_approve then '30 min' else '' end);
  return jsonb_build_object('ok', true);
end;
$$;

-- The details open only for the person who asked, only while the approval is live, and each opening is logged.
create or replace function public.admin_private_profile(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  b private.break_glass;
  i private.identities;
  place text;
begin
  if s.account_id is null then return private.fail('role', 'Not allowed.'); end if;
  perform private.expire_break_glass();
  select * into b from private.break_glass where id = p_id;
  if not found or b.status <> 'approved' or b.expires_at <= now() then return private.fail('expired', 'This approval has ended.'); end if;
  if b.requested_by <> s.account_id then return private.fail('not-yours', 'Only the person who asked can open the details.'); end if;
  select * into i from private.identities where account_id = b.target;
  select d.approx_place into place from public.devices d where d.account_id = b.target order by d.last_active_at desc limit 1;
  perform private.staff_log(s, 'Viewed private profile', b.target_name, b.reason_code);
  return jsonb_build_object('ok', true, 'name', coalesce(i.full_name, 'Name on record'), 'phone', coalesce(i.phone, 'Not on record'),
    'location', coalesce(nullif(place, ''), 'Not on record'), 'minutesLeft', greatest(0, ceil(extract(epoch from (b.expires_at - now())) / 60))::int);
end;
$$;

create or replace function public.admin_break_glass() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null then return private.fail('not-staff', 'Not allowed.'); end if;
  perform private.expire_break_glass();
  return jsonb_build_object('ok', true, 'requests', coalesce((
    select jsonb_agg(jsonb_build_object('id', b.id, 'caseId', b.case_id, 'target', b.target_name, 'reasonCode', b.reason_code,
      'justification', b.justification, 'requestedBy', b.requested_name, 'requestedAt', private.ms(b.requested_at), 'status', b.status,
      'approvedBy', b.approved_by, 'expiresAt', case when b.expires_at is null then null else private.ms(b.expires_at) end) order by b.requested_at desc)
    from private.break_glass b
    where b.requested_at > now() - interval '7 days' and (s.role in ('clinical', 'admin') or b.requested_by = s.account_id)), '[]'::jsonb));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_request_break_glass(text, text, text), public.admin_decide_break_glass(uuid, boolean), public.admin_private_profile(uuid), public.admin_break_glass() from public, anon;
grant execute on function public.admin_request_break_glass(text, text, text), public.admin_decide_break_glass(uuid, boolean), public.admin_private_profile(uuid), public.admin_break_glass() to authenticated;
