-- The session money numbers can be edited by an Admin in Configuration (Sessions): when a late cancellation starts and what it costs, what a member who
-- does not come gets back, how long a member waits for a therapist, the discount after a missed session, and when repeated missed sessions warn and pause
-- a therapist. They are stored in private.config (key sessionMoney). Every change is logged. The app reads them (app_config), so the cancel screen shows
-- the same amounts the server will use. A change applies to sessions cancelled or missed after it; refunds already made keep their amounts.
-- Nothing here removes data.

create or replace function private.session_money_json() returns jsonb
language sql stable set search_path = ''
as $$
  select '{"lateCancelMinutes":60,"lateCancelFeePct":10,"lateCancelTherapistSharePct":50,"noShowRefundPct":85,"noShowTherapistPct":0,"therapistWaitMinutes":15,
           "flakeDiscountPct":10,"flakeDiscountDays":90,"flakeWindowDays":60,"flakeWarnAt":2,"flakePauseAt":3}'::jsonb
    || coalesce((select value from private.config where key = 'sessionMoney'), '{}'::jsonb)
$$;

select private.replace_in_function('public.app_config()'::regprocedure,
  '''limits'', (select value from private.config where key = ''limits''),',
  '''limits'', (select value from private.config where key = ''limits''), ''sessionMoney'', private.session_money_json(),', '''sessionMoney''');
select private.replace_in_function('public.admin_config()'::regprocedure,
  '''limits'', (select value from private.config where key = ''limits''),',
  '''limits'', (select value from private.config where key = ''limits''), ''sessionMoney'', private.session_money_json(),', '''sessionMoney''');

create or replace function public.admin_set_session_money(p jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  v jsonb;
  k text;
  late_min int; late_fee int; late_share int; refund int; ther int; wait int; disc int; disc_days int; win int; warn_at int; pause_at int;
begin
  if s.account_id is null or s.role <> 'admin' then return private.fail('role', 'Your role can’t change these.'); end if;
  if p is null or jsonb_typeof(p) <> 'object' then return private.fail('invalid', 'Nothing to save.'); end if;
  for k in select unnest(array['lateCancelMinutes','lateCancelFeePct','lateCancelTherapistSharePct','noShowRefundPct','noShowTherapistPct','therapistWaitMinutes','flakeDiscountPct','flakeDiscountDays','flakeWindowDays','flakeWarnAt','flakePauseAt']) loop
    if jsonb_typeof(p -> k) is distinct from 'number' or (p ->> k) !~ '^\d{1,5}$' then return private.fail('invalid', 'Every number needs a whole value.'); end if;
  end loop;
  late_min := (p ->> 'lateCancelMinutes')::int; late_fee := (p ->> 'lateCancelFeePct')::int; late_share := (p ->> 'lateCancelTherapistSharePct')::int;
  refund := (p ->> 'noShowRefundPct')::int; ther := (p ->> 'noShowTherapistPct')::int; wait := (p ->> 'therapistWaitMinutes')::int;
  disc := (p ->> 'flakeDiscountPct')::int; disc_days := (p ->> 'flakeDiscountDays')::int; win := (p ->> 'flakeWindowDays')::int;
  warn_at := (p ->> 'flakeWarnAt')::int; pause_at := (p ->> 'flakePauseAt')::int;
  if late_min not between 0 and 2880 then return private.fail('invalid', 'A late cancellation starts 0 to 2880 minutes (2 days) before a session.'); end if;
  if late_fee not between 0 and 100 then return private.fail('invalid', 'The cancellation fee is 0 to 100%.'); end if;
  if late_share not between 0 and 100 then return private.fail('invalid', 'The therapist’s share of the fee is 0 to 100%.'); end if;
  if refund not between 0 and 100 or ther not between 0 and 100 then return private.fail('invalid', 'A no-show refund and the therapist’s share are 0 to 100%.'); end if;
  if refund + ther > 100 then return private.fail('invalid', 'The refund and the therapist’s share can’t add up to more than 100%.'); end if;
  if wait not between 5 and 60 then return private.fail('invalid', 'Members wait 5 to 60 minutes for a therapist.'); end if;
  if disc not between 0 and 50 then return private.fail('invalid', 'The rebooking discount is 0 to 50%.'); end if;
  if disc_days not between 1 and 365 then return private.fail('invalid', 'The discount lasts 1 to 365 days.'); end if;
  if win not between 7 and 365 then return private.fail('invalid', 'Missed sessions are counted over 7 to 365 days.'); end if;
  if warn_at not between 0 and 10 or pause_at not between 0 and 20 then return private.fail('invalid', 'A warning is at 0 to 10 missed sessions and a pause at 0 to 20 (0 turns it off).'); end if;
  if warn_at > 0 and pause_at > 0 and pause_at <= warn_at then return private.fail('invalid', 'A pause has to come after the warning.'); end if;
  v := jsonb_build_object('lateCancelMinutes', late_min, 'lateCancelFeePct', late_fee, 'lateCancelTherapistSharePct', late_share, 'noShowRefundPct', refund, 'noShowTherapistPct', ther,
    'therapistWaitMinutes', wait, 'flakeDiscountPct', disc, 'flakeDiscountDays', disc_days, 'flakeWindowDays', win, 'flakeWarnAt', warn_at, 'flakePauseAt', pause_at);
  update private.config set value = value || v where key = 'sessionMoney';
  perform private.staff_log(s, 'Changed session money rules', 'Configuration',
    'late cancel ' || late_min || ' min, ' || late_fee || '% (' || late_share || '% to therapist); no-show ' || refund || '% back, ' || ther || '% to therapist; wait ' || wait
    || ' min; rebook ' || disc || '% for ' || disc_days || ' d; warn ' || warn_at || ', pause ' || pause_at || ' in ' || win || ' d');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_set_session_money(jsonb) from public, anon;
grant execute on function public.admin_set_session_money(jsonb) to authenticated;
