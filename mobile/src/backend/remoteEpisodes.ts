import { episodes as mockEpisodes, type NewEpisode } from '@/api/episodes'
import type { Episode, EpisodePlay, Res, StaffEpisode } from '@/api/types'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
const BUCKET = 'episodes'
const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
export const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** The most a single video may be. The storage project setting has to allow it too. */
export const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024
const MAX_POSTER_BYTES = 5 * 1024 * 1024

type Reply = { ok: boolean; error?: string; code?: string }

async function rpc<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

async function asMember<T>(body: Record<string, unknown>): Promise<(Reply & T) | null> {
  try {
    const r = await supabase().functions.invoke('episodes', { body })
    if (r.error || !r.data) return null
    return r.data as Reply & T
  } catch {
    return null
  }
}

/** Why a video can't be added, or null when it is fine. Pure, so it can be checked without uploading. */
export function checkVideo(f: { mime: string; size: number }): string | null {
  if (!VIDEO_TYPES.includes(f.mime)) return 'Choose an MP4, MOV or WebM video.'
  if (f.size <= 0) return 'That file looks empty.'
  if (f.size > MAX_VIDEO_BYTES) return 'That video is over 5 GB. Compress it first.'
  return null
}
export function checkPoster(f: { mime: string; size: number }): string | null {
  if (!POSTER_TYPES.includes(f.mime)) return 'The picture has to be a JPEG, PNG or WebP image.'
  if (f.size > MAX_POSTER_BYTES) return 'The picture is over 5 MB. Use a smaller one.'
  return null
}

async function upload(path: string, f: NewEpisode['video']): Promise<boolean> {
  let body: Blob | ArrayBuffer
  try {
    body = f.file ?? (await (await fetch(f.uri)).arrayBuffer())
  } catch {
    return false
  }
  const up = await supabase().storage.from(BUCKET).upload(path, body, { contentType: f.mime, upsert: false })
  return !up.error
}

export const remoteEpisodes = {
  ...mockEpisodes,

  async list(): Promise<Res<Episode[]>> {
    const d = await asMember<{ episodes?: { id: string; title: string; blurb: string; duration_sec: number | null; published_at: number; poster_url: string | null }[] }>({ action: 'list' })
    if (!d) return { ok: false, error: OFFLINE, code: 'network' }
    if (!d.ok) return { ok: false, error: d.error ?? OFFLINE, code: d.code }
    return { ok: true, value: (d.episodes ?? []).map((e) => ({ id: e.id, title: e.title, blurb: e.blurb, durationSec: e.duration_sec, publishedAt: e.published_at, posterUrl: e.poster_url })) }
  },

  async play(id: string): Promise<Res<EpisodePlay>> {
    const d = await asMember<{ title?: string; blurb?: string; duration_sec?: number | null; video_url?: string; poster_url?: string | null }>({ action: 'play', id })
    if (!d) return { ok: false, error: OFFLINE, code: 'network' }
    if (!d.ok || !d.video_url) return { ok: false, error: d.error ?? 'That episode isn’t available.', code: d.code }
    return { ok: true, value: { title: d.title ?? '', blurb: d.blurb ?? '', durationSec: d.duration_sec ?? null, videoUrl: d.video_url, posterUrl: d.poster_url ?? null } }
  },

  async staffList(): Promise<Res<StaffEpisode[]>> {
    const d = await rpc<Reply & { episodes?: { id: string; title: string; blurb: string; status: 'draft' | 'published'; duration_sec: number | null; size_bytes: number | null; published_at: number | null; created_by: string; created_at: number }[] }>('admin_episodes')
    if (!d.ok) return { ok: false, error: d.error ?? OFFLINE, code: d.code }
    return {
      ok: true,
      value: (d.episodes ?? []).map((e) => ({ id: e.id, title: e.title, blurb: e.blurb, status: e.status, durationSec: e.duration_sec, sizeBytes: e.size_bytes, publishedAt: e.published_at, createdBy: e.created_by, createdAt: e.created_at })),
    }
  },

  /** Uploads the video (and picture) to private storage, then records the episode as a draft. */
  async add(input: NewEpisode): Promise<Res<{ id: string }>> {
    const badVideo = checkVideo(input.video)
    if (badVideo) return { ok: false, error: badVideo, code: 'file' }
    if (input.poster) {
      const badPoster = checkPoster(input.poster)
      if (badPoster) return { ok: false, error: badPoster, code: 'file' }
    }
    const id = globalThis.crypto.randomUUID()
    const videoPath = `v/${id}/video.${EXT[input.video.mime]}`
    if (!(await upload(videoPath, input.video))) return { ok: false, error: 'The video didn’t upload. Check your connection and the file size, then try again.', code: 'upload' }
    let posterPath: string | null = null
    if (input.poster) {
      posterPath = `v/${id}/poster.${EXT[input.poster.mime]}`
      if (!(await upload(posterPath, input.poster))) posterPath = null
    }
    const r = await rpc<Reply & { id?: string }>('admin_add_episode', {
      p_id: id, p_title: input.title, p_blurb: input.blurb, p_video_path: videoPath, p_poster_path: posterPath, p_duration: input.durationSec ?? null, p_size: input.video.size,
    })
    return r.ok ? { ok: true, value: { id } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },

  async edit(id: string, title: string, blurb: string): Promise<Res> {
    return res(await rpc('admin_edit_episode', { p_id: id, p_title: title, p_blurb: blurb }))
  },

  async setPublished(id: string, publish: boolean): Promise<Res> {
    return res(await rpc('admin_set_episode_published', { p_id: id, p_publish: publish }))
  },
}
