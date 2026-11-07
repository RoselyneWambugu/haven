import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '../src/api'
import { setClient } from '../src/backend/client'
import { checkPoster, checkVideo, remoteEpisodes } from '../src/backend/remoteEpisodes'
import { canAccess } from '../src/lib/admin'
import { resetClock } from '../src/lib/clock'
import { durationLabel, newestFirst, sizeLabel } from '../src/lib/episodes'
import { freshState, update } from '../src/store/db'

describe('episode wording', () => {
  it('says how long an episode is', () => {
    expect(durationLabel(1860)).toBe('31 min')
    expect(durationLabel(3720)).toBe('1 h 02 min')
    expect(durationLabel(20)).toBe('1 min')
    expect(durationLabel(null)).toBeNull()
  })
  it('shows the newest first, then the rest', () => {
    const e = (id: string, at: number) => ({ id, title: id, blurb: '', durationSec: null, publishedAt: at, posterUrl: null })
    const r = newestFirst([e('a', 1), e('c', 3), e('b', 2)])
    expect(r.latest?.id).toBe('c')
    expect(r.earlier.map((x) => x.id)).toEqual(['b', 'a'])
    expect(newestFirst([])).toEqual({ latest: null, earlier: [] })
  })
  it('writes file sizes for staff', () => {
    expect(sizeLabel(812 * 1024 ** 2)).toBe('812 MB')
    expect(sizeLabel(1.5 * 1024 ** 3)).toBe('1.5 GB')
    expect(sizeLabel(null)).toBeNull()
  })
})

describe('checking a file before it uploads', () => {
  it('only takes MP4, MOV and WebM videos up to 5 GB', () => {
    expect(checkVideo({ mime: 'video/mp4', size: 1000 })).toBeNull()
    expect(checkVideo({ mime: 'video/quicktime', size: 1000 })).toBeNull()
    expect(checkVideo({ mime: 'application/pdf', size: 1000 })).toMatch(/MP4/)
    expect(checkVideo({ mime: 'video/mp4', size: 0 })).toMatch(/empty/)
    expect(checkVideo({ mime: 'video/mp4', size: 6 * 1024 ** 3 })).toMatch(/5 GB/)
  })
  it('only takes images under 5 MB for the picture', () => {
    expect(checkPoster({ mime: 'image/jpeg', size: 1000 })).toBeNull()
    expect(checkPoster({ mime: 'video/mp4', size: 1000 })).toMatch(/JPEG/)
    expect(checkPoster({ mime: 'image/png', size: 6 * 1024 ** 2 })).toMatch(/5 MB/)
  })
})

describe('who manages episodes', () => {
  it('is Admins and clinical reviewers, not moderators or billing', () => {
    expect(canAccess('admin', 'episodes')).toBe(true)
    expect(canAccess('clinical', 'episodes')).toBe(true)
    expect(canAccess('moderator', 'episodes')).toBe(false)
    expect(canAccess('billing', 'episodes')).toBe(false)
  })
})

describe('Watch in the demo', () => {
  beforeEach(() => {
    resetClock()
    update(freshState())
  })
  it('needs a plan, like the rest of Echo', async () => {
    expect(await api.episodes.list()).toMatchObject({ ok: false, code: 'needs-plan' })
    expect(await api.episodes.play('ep-1')).toMatchObject({ ok: false, code: 'needs-plan' })
  })
  it('lists sample episodes and plays one once there is a plan', async () => {
    api.demo.grantPlan('monthly')
    const r = await api.episodes.list()
    expect(r.ok && r.value.length).toBe(3)
    const p = await api.episodes.play('ep-2')
    expect(p.ok && p.value.videoUrl).toMatch(/^https:/)
    expect(await api.episodes.play('nope')).toMatchObject({ ok: false, code: 'gone' })
  })
  it('does not let the demo upload', async () => {
    const r = await api.episodes.add({ title: 'A title long enough', blurb: 'x'.repeat(30), video: { name: 'a.mp4', size: 10, mime: 'video/mp4', uri: 'x' } })
    expect(r).toMatchObject({ ok: false, code: 'unavailable' })
  })
})

describe('Watch on the live service', () => {
  afterEach(() => setClient(null))
  function fake(replies: Record<string, unknown>) {
    const calls: { kind: string; name: string; args?: unknown }[] = []
    const uploads: { path: string; type: string }[] = []
    setClient({
      rpc: async (name: string, args?: unknown) => (calls.push({ kind: 'rpc', name, args }), { data: replies[name] ?? { ok: true }, error: null }),
      functions: { invoke: async (name: string, o: { body: unknown }) => (calls.push({ kind: 'fn', name, args: o.body }), { data: replies[`fn:${(o.body as { action: string }).action}`], error: null }) },
      storage: { from: () => ({ upload: async (path: string, _b: unknown, o: { contentType: string }) => (uploads.push({ path, type: o.contentType }), { error: null }) }) },
    } as unknown as SupabaseClient)
    return { calls, uploads }
  }

  it('lists episodes through the edge function', async () => {
    const f = fake({ 'fn:list': { ok: true, episodes: [{ id: 'e1', title: 'T', blurb: 'B', duration_sec: 60, published_at: 5, poster_url: 'https://x/p.jpg' }] } })
    const r = await remoteEpisodes.list()
    expect(r).toEqual({ ok: true, value: [{ id: 'e1', title: 'T', blurb: 'B', durationSec: 60, publishedAt: 5, posterUrl: 'https://x/p.jpg' }] })
    expect(f.calls[0]).toEqual({ kind: 'fn', name: 'episodes', args: { action: 'list' } })
  })

  it('hands back the plain reason when there is no plan', async () => {
    fake({ 'fn:play': { ok: false, code: 'needs-plan', error: 'Watch needs an active plan.' } })
    expect(await remoteEpisodes.play('e1')).toEqual({ ok: false, error: 'Watch needs an active plan.', code: 'needs-plan' })
  })

  it('uploads the video and picture into one folder, then records the draft', async () => {
    const f = fake({})
    const blob = new Blob(['x'])
    const r = await remoteEpisodes.add({
      title: 'Red table, week one', blurb: 'A first conversation about talking to people we love.',
      video: { name: 'a.mp4', size: 1000, mime: 'video/mp4', uri: 'u', file: blob }, poster: { name: 'p.jpg', size: 10, mime: 'image/jpeg', uri: 'u2', file: blob }, durationSec: 1800,
    })
    expect(r.ok).toBe(true)
    const id = r.ok ? r.value.id : ''
    expect(f.uploads).toEqual([{ path: `v/${id}/video.mp4`, type: 'video/mp4' }, { path: `v/${id}/poster.jpg`, type: 'image/jpeg' }])
    expect(f.calls[0]).toMatchObject({ name: 'admin_add_episode', args: { p_id: id, p_video_path: `v/${id}/video.mp4`, p_poster_path: `v/${id}/poster.jpg`, p_duration: 1800, p_size: 1000 } })
  })

  it('refuses a bad file before uploading anything', async () => {
    const f = fake({})
    const r = await remoteEpisodes.add({ title: 'Red table, week one', blurb: 'A first conversation about talking to people we love.', video: { name: 'a.pdf', size: 10, mime: 'application/pdf', uri: 'u' } })
    expect(r).toMatchObject({ ok: false, code: 'file' })
    expect(f.uploads).toEqual([])
  })

  it('publishes and unpublishes', async () => {
    const f = fake({})
    await remoteEpisodes.setPublished('e1', true)
    await remoteEpisodes.setPublished('e1', false)
    expect(f.calls.map((c) => c.args)).toEqual([{ p_id: 'e1', p_publish: true }, { p_id: 'e1', p_publish: false }])
  })
})
