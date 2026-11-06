-- A therapist who keeps missing sessions is warned, and then paused. Each session a member reports as missed by the therapist (the therapist had not
-- joined 15 minutes in) is counted over the last 60 days:
--   2 missed: a warning is put in force (the therapist sees it in the portal and can appeal, like any warning), staff see it in the audit log and
--             a "missed sessions" count beside the therapist in the roster;
--   3 missed: new clients are paused (existing clients are not affected). A clinical reviewer can lift the pause, and the therapist can appeal.
-- The numbers are in private.config (sessionMoney: flakeWindowDays, flakeWarnAt, flakePauseAt; 0 switches a step off).
-- Each missed session also counts as a 1-star rating and gives the member a discount on their next booking (see the earlier migrations).
-- Nothing here removes data.

update private.config set value = value || '{"flakeWindowDays":60,"flakeWarnAt":2,"flakePauseAt":3}'::jsonb where key = 'sessionMoney';

create or replace function private.missed_count(p_therapist text) returns int
language sql stable set search_path = ''
as $$
  select count(*)::int from private.sessions s
  where s.therapist_id = p_therapist and s.flaked and s.start_at > now() - make_interval(days => private.money_cfg('flakeWindowDays', 60))
$$;

-- Looks at a therapist after a missed session and puts a warning or a pause in force. It never repeats a step already in force.
create or replace function private.review_flakes(p_therapist text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  n int := private.missed_count(p_therapist);
  days int := private.money_cfg('flakeWindowDays', 60);
  warn_at int := private.money_cfg('flakeWarnAt', 2);
  pause_at int := private.money_cfg('flakePauseAt', 3);
  t private.therapists;
  body text;
begin
  select * into t from private.therapists where id = p_therapist;
  if not found then return; end if;
  if pause_at > 0 and n >= pause_at then
    if t.paused or exists (select 1 from private.therapist_decisions d where d.therapist_id = p_therapist and d.cleared_at is null and d.kind in ('paused', 'suspended')) then return; end if;
    body := 'New clients are paused because you missed ' || n || ' sessions in the last ' || days || ' days: clients waited and you didn’t join. Your existing clients are not affected. A clinical reviewer will look at this and can lift the pause. You can appeal.';
    update private.therapists set paused = true where id = p_therapist;
    perform private.clear_decisions(p_therapist, array['warning']);
    perform private.record_decision(p_therapist, 'paused', 'System', body);
    insert into private.therapist_notes (therapist_id, title, body, href) values (p_therapist, 'New clients are paused', body, '/portal');
    insert into private.audit (actor, role, action, target, reason) values ('System', 'system', 'Paused a therapist for missed sessions', p_therapist, n || ' missed in ' || days || ' days');
  elsif warn_at > 0 and n >= warn_at then
    if exists (select 1 from private.therapist_decisions d where d.therapist_id = p_therapist and d.cleared_at is null and d.kind in ('warning', 'paused', 'suspended')) then return; end if;
    body := 'You missed ' || n || ' sessions in the last ' || days || ' days: clients waited and you didn’t join.'
      || case when pause_at > 0 then ' This is a warning. If you miss ' || (pause_at - n) || ' more in that time, new clients will be paused.' else ' This is a warning.' end
      || ' Each missed session also counts as a 1-star rating on your profile. You can appeal.';
    perform private.record_decision(p_therapist, 'warning', 'System', body);
    insert into private.therapist_notes (therapist_id, title, body, href) values (p_therapist, 'A warning about missed sessions', body, '/portal');
    insert into private.audit (actor, role, action, target, reason) values ('System', 'system', 'Warned a therapist for missed sessions', p_therapist, n || ' missed in ' || days || ' days');
  end if;
end;
$$;

select private.replace_in_function('public.report_therapist_late(uuid)'::regprocedure,
  '''/portal/sessions'');',
  '''/portal/sessions'');
  perform private.review_flakes(s.therapist_id);', 'private.review_flakes');

-- Staff see how many sessions each therapist has missed, and whether new clients are paused.
select private.replace_in_function('public.admin_state()'::regprocedure,
  '''suspended'', t.suspended, ''paused'', t.paused)',
  '''suspended'', t.suspended, ''paused'', t.paused, ''missed'', private.missed_count(t.id))', '''missed'', private.missed_count');

revoke all on all functions in schema private from public, anon, authenticated;

-- A pause put in force by a review (or by this rule) can't be switched off by the therapist's own pause toggle: only a clinical reviewer can lift it, or an appeal.
select private.replace_in_function('public.portal_set_paused(boolean)'::regprocedure,
  'return private.fail(''not-therapist'', ''This number isn’t linked to a therapist account.''); end if;',
  'return private.fail(''not-therapist'', ''This number isn’t linked to a therapist account.''); end if;
  if p_paused is not true and exists (select 1 from private.therapist_decisions d where d.therapist_id = tid and d.cleared_at is null and d.kind in (''paused'', ''suspended'')) then
    return private.fail(''locked'', ''New clients are paused by a review. Only a clinical reviewer can lift it, or an appeal.'');
  end if;', 'Only a clinical reviewer can lift it');
