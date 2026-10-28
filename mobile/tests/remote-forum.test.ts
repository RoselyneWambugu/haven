import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { stopPolling, remoteReport } from '../src/backend/remoteChat'
import { remoteForum, remoteSpaces, syncForum } from '../src/backend/remoteForum'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'
import { DEFAULT_SETTINGS } from '../src/api/auth'
import type { Account } from '../src/api/types'

const iso = (n: number) => new Date(Date.UTC(2026, 9, 21, 8, 0, n)).toISOString()
const POST = {
  id: 'p1', author_name: 'QuietPine', author_avatar: 'pine', author_key: 'k-1', topic: 'Grief', space: null, title: 'Lost my dad', body: 'I do not know how to explain it at work.',
  created_at: iso(0), status: 'published', mine: false, supports: 3, supported_by_me: false,
  comments: [{ id: 'c1', author_name: 'GentleFern', author_avatar: 'fern', text: 'I am so sorry.', at: iso(5), mine: false }],
}
const MINE = { ...POST, id: 'p2', author_name: 'Me', author_key: 'me', mine: true, title: 'My post', status: 'pending', comments: [] }

interface Script { feed?: unknown; create?: unknown; comment?: unknown; fail?: string }

function fake(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (script.fail === name) return { data: null, error: { message: 'down' } }
      if (name === 'forum_feed') return { data: script.feed ?? { ok: true, posts: [POST], spaces: ['grief'] }, error: null }
      if (name === 'create_post') return { data: script.create ?? { ok: true, post_id: 'p2', pending: true }, error: null }
      if (name === 'add_comment') return { data: script.comment ?? { ok: true, comment_id: 'c9' }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

const member = { id: 'u1', standing: 'good', settings: { ...DEFAULT_SETTINGS, quietHours: false }, public: { penName: 'Me' }, blocked: [] } as unknown as Account
const paid = { plan: 'monthly', status: 'active', renewsAt: Date.now() + 1e10 }

beforeEach(() => {
  resetClock()
  update({ ...freshState(), account: member, signedIn: true, posts: [], subscription: paid } as never)
})
afterEach(() => stopPolling())

describe('syncing the community', () => {
  it('shows what the server returns and no starter posts', async () => {
    fake()
    await syncForum()
    const posts = getDb().posts
    expect(posts.map((p) => p.id)).toEqual(['p1'])
    expect(posts[0]).toMatchObject({ authorName: 'QuietPine', authorKey: 'k-1', supports: 3, mine: false, status: 'published' })
    expect(posts[0].comments[0]).toMatchObject({ authorName: 'GentleFern', hiddenReason: null, therapistId: null })
    expect(getDb().spaces).toEqual(['grief'])
  })

  it('tells the member when their post goes live and when someone replies', async () => {
    fake({ feed: { ok: true, posts: [MINE], spaces: [] } })
    await syncForum()
    const before = getDb().notifications.length
    fake({ feed: { ok: true, posts: [{ ...MINE, status: 'published', comments: [{ id: 'c7', author_name: 'SoftDune', author_avatar: 'moon', text: 'Hello', at: iso(9), mine: false }] }], spaces: [] } })
    await syncForum()
    const titles = getDb().notifications.slice(0, getDb().notifications.length - before).map((n) => n.title)
    expect(titles).toContain('Your post is now live')
    expect(titles).toContain('New reply to your post')
  })

  it('keeps what it had when the server can’t be reached', async () => {
    fake()
    await syncForum()
    fake({ fail: 'forum_feed' })
    await syncForum()
    expect(getDb().posts).toHaveLength(1)
  })
})

describe('posting and commenting', () => {
  it('needs a plan, checked on the device until billing is on the server', async () => {
    update({ subscription: null } as never)
    fake()
    expect(await remoteForum.create({ topic: 'Grief', title: 'x', body: 'a long enough body' })).toMatchObject({ ok: false, code: 'needs-plan' })
  })

  it('stops contact details on the device without calling the server', async () => {
    const calls = fake()
    const r = await remoteForum.create({ topic: 'Grief', title: 'Call me', body: 'my number is 0712 345 678 please call' })
    expect(r).toMatchObject({ ok: false, code: 'blocked' })
    expect(calls.some((c) => c.name === 'create_post')).toBe(false)
  })

  it('creates a post on the server and returns it, held for checking when the server says so', async () => {
    fake({ feed: { ok: true, posts: [MINE], spaces: [] } })
    const r = await remoteForum.create({ topic: 'Grief', title: 'My post', body: 'a long enough body here' })
    expect(r.ok && r.value.pending).toBe(true)
    expect(r.ok && r.value.post.id).toBe('p2')
  })

  it('posts into a space with the space’s name as the topic', async () => {
    const calls = fake({ feed: { ok: true, posts: [MINE], spaces: ['ptsd'] } })
    await remoteForum.create({ topic: 'ignored', title: 'My post', body: 'a long enough body here', space: 'ptsd' })
    expect(calls.find((c) => c.name === 'create_post')?.args).toMatchObject({ p_space: 'ptsd', p_topic: 'PTSD and trauma' })
  })

  it('shows the server’s reason when it refuses', async () => {
    fake({ create: { ok: false, code: 'not-joined', error: 'Join this space to post in it.' } })
    expect(await remoteForum.create({ topic: 'Grief', title: 'x', body: 'a long enough body here', space: 'ptsd' })).toMatchObject({ ok: false, code: 'not-joined' })
  })

  it('adds a comment and returns it from the refreshed post', async () => {
    fake({ feed: { ok: true, posts: [{ ...POST, comments: [...POST.comments, { id: 'c9', author_name: 'Me', author_avatar: 'moon', text: 'Hi', at: iso(30), mine: true }] }], spaces: [] }, comment: { ok: true, comment_id: 'c9' } })
    const r = await remoteForum.comment('p1', ' Hi ')
    expect(r.ok && r.value.comment).toMatchObject({ id: 'c9', mine: true })
  })

  it('supporting a post shows at once and tells the server', async () => {
    update({ posts: [{ ...POST, authorName: 'QuietPine', authorAvatar: 'pine', authorKey: 'k-1', createdAt: 0, supports: 3, supportedByMe: false, comments: [], status: 'published', mine: false }] } as never)
    const calls = fake()
    remoteForum.toggleSupport('p1')
    expect(getDb().posts[0]).toMatchObject({ supportedByMe: true, supports: 4 })
    expect(calls.find((c) => c.name === 'toggle_support')?.args).toEqual({ p_post: 'p1' })
  })

  it('removing a post takes it off the screen and asks the server', () => {
    update({ posts: [{ id: 'p2', mine: true, comments: [] }] } as never)
    const calls = fake()
    remoteForum.remove('p2')
    expect(getDb().posts).toEqual([])
    expect(calls.find((c) => c.name === 'remove_post')?.args).toEqual({ p_post: 'p2' })
  })

  it('does not start the device’s own timers that publish or reply', () => {
    update({ posts: [{ id: 'p2', mine: true, status: 'pending', comments: [], createdAt: 0 }] } as never)
    remoteForum.resume()
    expect(getDb().posts[0].status).toBe('pending')
  })
})

describe('spaces and reports', () => {
  it('joining shows at once and tells the server; leaving does the same', () => {
    const calls = fake()
    expect(remoteSpaces.join('ptsd').ok).toBe(true)
    expect(getDb().spaces).toContain('ptsd')
    remoteSpaces.leave('ptsd')
    expect(getDb().spaces).not.toContain('ptsd')
    expect(calls.map((c) => c.name)).toEqual(expect.arrayContaining(['join_space', 'leave_space']))
  })

  it('adds no starter posts', () => {
    remoteSpaces.ensureSeeds()
    expect(getDb().posts).toEqual([])
  })

  it('sends reports of posts and comments to the server', () => {
    const calls = fake()
    remoteReport.submit({ target: 'post', targetId: 'p1', reason: 'harassment', note: '', postId: 'p1' })
    remoteReport.submit({ target: 'comment', targetId: 'c1', reason: 'hate', note: 'x', postId: 'p1' })
    expect(calls.find((c) => c.name === 'report_post')?.args).toMatchObject({ p_post: 'p1', p_reason: 'harassment' })
    expect(calls.find((c) => c.name === 'report_comment')?.args).toMatchObject({ p_comment: 'c1', p_reason: 'hate' })
  })
})
