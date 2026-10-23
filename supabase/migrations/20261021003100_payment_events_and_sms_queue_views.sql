-- Staff views: odd payments to reconcile (and the ones that need a refund by hand), and the text message queue.
alter table private.payment_events add column if not exists resolved_at timestamptz;
alter table private.payment_events add column if not exists resolved_by text;
alter table private.payment_events add column if not exists resolution text;

create or replace function public.admin_payment_events() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true, 'events', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'reference', e.reference, 'at', private.ms(e.created_at), 'resolved', e.resolved_at is not null,
      'resolvedBy', e.resolved_by, 'resolution', e.resolution,
      'penName', (select p.pen_name from public.profiles p where p.account_id = o.account_id),
      'amountKes', o.amount_kes, 'what', case when o.kind = 'session' then 'Session' when o.id is null then null else coalesce(pl.label, 'Plan') end,
      'detail', coalesce(e.payload->>'why', e.payload->>'desc', case when e.payload ? 'paid' then 'Paid ' || (e.payload->>'paid') || ', expected ' || coalesce(e.payload->>'expected', '?') end, ''))
      order by (e.resolved_at is null) desc, e.created_at desc)
    from (select * from private.payment_events order by created_at desc limit 100) e
    left join private.orders o on o.id = e.order_id
    left join private.plans pl on pl.id = o.plan_id), '[]'::jsonb));
end;
$$;

create or replace function public.admin_resolve_payment_event(p_id bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  e private.payment_events;
  nt text := btrim(coalesce(p_note, ''));
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Only billing staff and Admins resolve payment events.'); end if;
  select * into e from private.payment_events where id = p_id for update;
  if not found then return private.fail('gone', 'That event isn’t here.'); end if;
  if e.resolved_at is not null then return private.fail('resolved', 'It is already resolved.'); end if;
  if char_length(nt) < 5 then return private.fail('note', 'Say what you did, for example the refund reference.'); end if;
  update private.payment_events set resolved_at = now(), resolved_by = s.name, resolution = left(nt, 300) where id = e.id;
  perform private.staff_log(s, 'Resolved payment event', e.kind || ' ' || coalesce(e.reference, ''), left(nt, 300));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_sms_queue() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Not allowed.'); end if;
  return jsonb_build_object('ok', true,
    'queued', (select count(*) from private.sms_outbox where status in ('queued', 'sending')),
    'sent24h', (select count(*) from private.sms_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
    'failed', (select count(*) from private.sms_outbox where status = 'failed'),
    'oldestQueuedMinutes', (select round(extract(epoch from now() - min(created_at)) / 60)::int from private.sms_outbox where status in ('queued', 'sending')),
    'failures', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'phoneTail', right(f.phone, 3), 'error', f.error, 'at', private.ms(f.created_at)) order by f.created_at desc)
                          from (select * from private.sms_outbox where status = 'failed' order by created_at desc limit 20) f), '[]'::jsonb));
end;
$$;

create or replace function public.admin_retry_sms(p_id bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('billing', 'admin') then return private.fail('role', 'Only billing staff and Admins retry texts.'); end if;
  update private.sms_outbox set status = 'queued', attempts = 0, error = null where id = p_id and status = 'failed';
  if not found then return private.fail('gone', 'That text isn’t waiting to be retried.'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_payment_events(), public.admin_resolve_payment_event(bigint, text), public.admin_sms_queue(), public.admin_retry_sms(bigint) from public, anon;
grant execute on function public.admin_payment_events(), public.admin_resolve_payment_event(bigint, text), public.admin_sms_queue(), public.admin_retry_sms(bigint) to authenticated;
