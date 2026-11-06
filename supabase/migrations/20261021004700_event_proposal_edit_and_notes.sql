-- A therapist can edit a proposal that is waiting, or one that was declined (which sends it back for review), and is told when a decision is made.

create table if not exists private.therapist_notes (
  id uuid primary key default gen_random_uuid(),
  therapist_id text not null references private.therapists (id),
  title text not null,
  body text not null,
  href text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz
);
create index if not exists therapist_notes_idx on private.therapist_notes (therapist_id, created_at desc);
alter table private.therapist_notes enable row level security;

create or replace function public.portal_notes() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare tid text := private.therapist_of(private.require_member());
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  return jsonb_build_object('ok', true, 'notes', coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'href', n.href, 'at', private.ms(n.created_at), 'read', n.read_at is not null) order by n.created_at desc)
    from (select * from private.therapist_notes where therapist_id = tid order by created_at desc limit 30) n), '[]'::jsonb));
end;
$$;

create or replace function public.portal_notes_read() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare tid text := private.therapist_of(private.require_member());
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  update private.therapist_notes set read_at = now() where therapist_id = tid and read_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Deciding a proposal now leaves a note for the therapist.
create or replace function public.admin_decide_event(p_id uuid, p_approve boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  e private.events;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only clinical reviewers and Admins decide event proposals.'); end if;
  select * into e from private.events where id = p_id for update;
  if not found or e.status <> 'pending' then return private.fail('gone', 'That proposal isn’t waiting any more.'); end if;
  if p_approve then
    if e.starts_at < now() + interval '60 minutes' then return private.fail('late', 'The start time is too close or has passed. Decline it and ask for a new time.'); end if;
    update private.events set status = 'live', decided_by = s.name, decided_at = now() where id = e.id;
    perform private.staff_log(s, 'Approved event proposal', e.title, 'Proposed by ' || e.created_by);
    if e.therapist_id is not null then
      insert into private.therapist_notes (therapist_id, title, body, href) values (e.therapist_id, 'Your event was approved', e.title || ' is now live for members to see and say they are interested.', '/portal/events');
    end if;
  else
    if char_length(btrim(coalesce(p_reason, ''))) < 5 then return private.fail('reason', 'Say why, so the therapist can improve it.'); end if;
    update private.events set status = 'declined', decline_reason = btrim(p_reason), decided_by = s.name, decided_at = now() where id = e.id;
    perform private.staff_log(s, 'Declined event proposal', e.title, btrim(p_reason));
    if e.therapist_id is not null then
      insert into private.therapist_notes (therapist_id, title, body, href) values (e.therapist_id, 'Your event proposal was declined', e.title || '. Reason: “' || btrim(p_reason) || '”. You can edit it and send it again.', '/portal/events');
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Editing a waiting or declined proposal. A declined one goes back for review, and counts again against the three that may wait.
create or replace function public.portal_edit_event(p_id uuid, p_title text, p_blurb text, p_kind text, p_mode text, p_place text, p_starts timestamptz, p_duration int) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  tid text := private.therapist_of(private.require_member());
  e private.events;
  tt text := btrim(coalesce(p_title, ''));
  bl text := btrim(coalesce(p_blurb, ''));
  pl text := btrim(coalesce(p_place, ''));
begin
  if tid is null then return private.fail('not-therapist', 'This number isn’t linked to a therapist account.'); end if;
  select * into e from private.events where id = p_id and therapist_id = tid for update;
  if not found or e.status not in ('pending', 'declined') then return private.fail('gone', 'That proposal can’t be edited any more.'); end if;
  if char_length(tt) < 8 then return private.fail('invalid', 'Give it a title of at least 8 characters.'); end if;
  if char_length(tt) > 80 then return private.fail('invalid', 'Keep the title under 80 characters.'); end if;
  if char_length(bl) < 20 then return private.fail('invalid', 'Say what it is about in at least 20 characters.'); end if;
  if char_length(bl) > 400 then return private.fail('invalid', 'Keep the description under 400 characters.'); end if;
  if p_kind not in ('webinar', 'workshop', 'talk', 'walk', 'meetup') then return private.fail('invalid', 'Choose what kind of event it is.'); end if;
  if p_mode not in ('online', 'in-person') then return private.fail('invalid', 'Choose online or in person.'); end if;
  if char_length(pl) < 3 then return private.fail('invalid', case when p_mode = 'in-person' then 'Name the public place it happens.' else 'Add a short note on how people join.' end); end if;
  if char_length(pl) > 120 then return private.fail('invalid', 'Keep the place or note under 120 characters.'); end if;
  if p_duration is null or p_duration not between 30 and 240 then return private.fail('invalid', 'An event runs 30 to 240 minutes.'); end if;
  if p_starts is null or p_starts < now() + interval '3 days' then return private.fail('invalid', 'Propose it at least three days ahead, so it can be reviewed.'); end if;
  if e.status = 'declined' and (select count(*) from private.events where therapist_id = tid and status = 'pending') >= 3 then
    return private.fail('too-many', 'You already have three proposals waiting. Wait for a decision, or withdraw one.');
  end if;
  update private.events set title = tt, blurb = bl, kind = p_kind, mode = p_mode, place = pl, starts_at = p_starts, duration_min = p_duration,
    status = 'pending', decline_reason = null, decided_by = null, decided_at = null where id = e.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.portal_notes(), public.portal_notes_read(), public.admin_decide_event(uuid, boolean, text), public.portal_edit_event(uuid, text, text, text, text, text, timestamptz, int) from public, anon;
grant execute on function public.portal_notes(), public.portal_notes_read(), public.admin_decide_event(uuid, boolean, text), public.portal_edit_event(uuid, text, text, text, text, text, timestamptz, int) to authenticated;
