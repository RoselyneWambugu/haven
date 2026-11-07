-- Watch: podcast video episodes.
-- Staff (Admins and clinical reviewers) upload a video file (and an optional poster picture) to a private storage bucket, add a title and a
-- description, and publish. Members with an active plan see the published episodes in the Watch tab and play them. The files are never public:
-- the app asks the "episodes" edge function for a short-lived link, and that function checks the plan first.
-- An unpublished episode is a draft: it is hidden from members but kept. Nothing here removes data.
-- The storage bucket's own limit is 5 GB a file; the project-wide limit (Storage settings) must be raised to match before large files upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('episodes', 'episodes', false, 5368709120, array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table if not exists private.episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 8 and 90),
  blurb text not null check (char_length(blurb) between 20 and 400),
  video_path text not null unique,
  poster_path text,
  duration_sec int check (duration_sec is null or duration_sec between 1 and 86400),
  size_bytes bigint,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists episodes_status_idx on private.episodes (status, published_at desc);
alter table private.episodes enable row level security;

-- Storage can't see the private schema, so the policies ask this. Passing the second factor is part of it.
create or replace function public.can_manage_episodes() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.staff s where s.account_id = (select auth.uid()) and s.active and s.role in ('clinical', 'admin') and private.aal_ok()) $$;
revoke execute on function public.can_manage_episodes() from public, anon;
grant execute on function public.can_manage_episodes() to authenticated;

create policy episodes_staff_add on storage.objects for insert to authenticated
  with check (bucket_id = 'episodes' and public.can_manage_episodes());
create policy episodes_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'episodes' and public.can_manage_episodes());

-- ---------------------------------------------------------------- members
create or replace function public.episodes_list() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.require_member();
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  return jsonb_build_object('ok', true, 'episodes', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'blurb', e.blurb, 'duration_sec', e.duration_sec, 'published_at', private.ms(e.published_at), 'poster_path', e.poster_path)
                     order by e.published_at desc)
    from private.episodes e where e.status = 'published'), '[]'::jsonb));
end;
$$;

-- One episode's file paths, for the edge function that signs a link. The plan is checked here, as the member.
create or replace function public.episode_access(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  e private.episodes;
begin
  if not private.has_plan(uid) then return private.fail('needs-plan', 'Watch needs an active plan.'); end if;
  select * into e from private.episodes where id = p_id and status = 'published';
  if not found then return private.fail('gone', 'That episode isn’t available.'); end if;
  return jsonb_build_object('ok', true, 'title', e.title, 'blurb', e.blurb, 'video_path', e.video_path, 'poster_path', e.poster_path, 'duration_sec', e.duration_sec);
end;
$$;

-- ---------------------------------------------------------------- staff
create or replace function public.admin_episodes() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare s private.staff := private.staff_of(private.require_member());
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only Admins and clinical reviewers manage episodes.'); end if;
  return jsonb_build_object('ok', true, 'episodes', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'blurb', e.blurb, 'status', e.status, 'duration_sec', e.duration_sec, 'size_bytes', e.size_bytes,
      'published_at', case when e.published_at is null then null else private.ms(e.published_at) end, 'created_by', e.created_by, 'created_at', private.ms(e.created_at)) order by e.created_at desc)
    from private.episodes e), '[]'::jsonb));
end;
$$;

-- The video was uploaded by the staff member to v/<new id>/...; this records it (as a draft). The server checks the file really is there.
create or replace function public.admin_add_episode(p_id uuid, p_title text, p_blurb text, p_video_path text, p_poster_path text, p_duration int, p_size bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_blurb, ''));
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only Admins and clinical reviewers manage episodes.'); end if;
  if char_length(t) < 8 or char_length(t) > 90 then return private.fail('title', 'Give the episode a title of 8 to 90 characters.'); end if;
  if char_length(b) < 20 or char_length(b) > 400 then return private.fail('blurb', 'Describe the episode in 20 to 400 characters.'); end if;
  if p_id is null or p_video_path is null or p_video_path not like 'v/' || p_id::text || '/%' then return private.fail('path', 'The video file isn’t in the right place. Try uploading again.'); end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'episodes' and o.name = p_video_path) then return private.fail('missing', 'We couldn’t find the uploaded video. Try again.'); end if;
  if p_poster_path is not null and (p_poster_path not like 'v/' || p_id::text || '/%' or not exists (select 1 from storage.objects o where o.bucket_id = 'episodes' and o.name = p_poster_path)) then
    return private.fail('poster', 'The picture wasn’t uploaded. Try again, or leave it out.');
  end if;
  insert into private.episodes (id, title, blurb, video_path, poster_path, duration_sec, size_bytes, created_by)
    values (p_id, t, b, p_video_path, p_poster_path, nullif(p_duration, 0), p_size, s.name);
  perform private.staff_log(s, 'Added an episode', 'E-' || p_id, t);
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.admin_edit_episode(p_id uuid, p_title text, p_blurb text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  t text := btrim(coalesce(p_title, ''));
  b text := btrim(coalesce(p_blurb, ''));
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only Admins and clinical reviewers manage episodes.'); end if;
  if char_length(t) < 8 or char_length(t) > 90 then return private.fail('title', 'Give the episode a title of 8 to 90 characters.'); end if;
  if char_length(b) < 20 or char_length(b) > 400 then return private.fail('blurb', 'Describe the episode in 20 to 400 characters.'); end if;
  update private.episodes set title = t, blurb = b, updated_at = now() where id = p_id;
  if not found then return private.fail('gone', 'That episode isn’t here.'); end if;
  perform private.staff_log(s, 'Edited an episode', 'E-' || p_id, t);
  return jsonb_build_object('ok', true);
end;
$$;

-- Publish makes it visible to members with a plan; unpublish hides it again (the file is kept).
create or replace function public.admin_set_episode_published(p_id uuid, p_publish boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.staff := private.staff_of(private.require_member());
  e private.episodes;
begin
  if s.account_id is null or s.role not in ('clinical', 'admin') then return private.fail('role', 'Only Admins and clinical reviewers manage episodes.'); end if;
  select * into e from private.episodes where id = p_id for update;
  if not found then return private.fail('gone', 'That episode isn’t here.'); end if;
  update private.episodes set status = case when p_publish then 'published' else 'draft' end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end, updated_at = now() where id = p_id;
  perform private.staff_log(s, case when p_publish then 'Published an episode' else 'Unpublished an episode' end, 'E-' || p_id, e.title);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on function public.episodes_list(), public.episode_access(uuid), public.admin_episodes(), public.admin_add_episode(uuid, text, text, text, text, int, bigint),
  public.admin_edit_episode(uuid, text, text), public.admin_set_episode_published(uuid, boolean) from public, anon;
grant execute on function public.episodes_list(), public.episode_access(uuid), public.admin_episodes(), public.admin_add_episode(uuid, text, text, text, text, int, bigint),
  public.admin_edit_episode(uuid, text, text), public.admin_set_episode_published(uuid, boolean) to authenticated;
