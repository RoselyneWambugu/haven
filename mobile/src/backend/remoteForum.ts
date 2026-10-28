import { forum as mockForum } from '@/api/social'
import { spaces as mockSpaces } from '@/api/spaces'
import { notify } from '@/api/notify'
import type { AvatarKind, ForumComment, ForumPost, Res } from '@/api/types'
import { spaceById } from '@/data/spaces'
import { now } from '@/lib/clock'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { canChat, planState } from '@/lib/plan'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'

interface RemoteComment { id: string; author_name: string; author_avatar: AvatarKind; text: string; at: string; mine: boolean }
interface RemotePost {
  id: string
  author_name: string
  author_avatar: AvatarKind
  author_key: string
  topic: string
  space: string | null
  title: string
  body: string
  created_at: string
  status: ForumPost['status']
  mine: boolean
  supports: number
  supported_by_me: boolean
  comments: RemoteComment[]
}

type Reply = { ok: true; [k: string]: unknown } | { ok: false; code: string; error: string }
const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
const ms = (iso: string): number => new Date(iso).getTime()

async function rpc(name: string, args?: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) return { ok: false, code: 'network', error: OFFLINE }
  return (data ?? { ok: true }) as Reply
}

const toComment = (c: RemoteComment): ForumComment => ({
  id: c.id, authorName: c.author_name, authorAvatar: c.author_avatar, therapistId: null, therapistName: null, text: c.text, at: ms(c.at), hiddenReason: null, mine: c.mine,
})

const toPost = (p: RemotePost): ForumPost => ({
  id: p.id, authorName: p.author_name, authorAvatar: p.author_avatar, authorKey: p.author_key, topic: p.topic, space: p.space ?? undefined, title: p.title, body: p.body,
  createdAt: ms(p.created_at), supports: p.supports, supportedByMe: p.supported_by_me, comments: p.comments.map(toComment), status: p.status, mine: p.mine,
})

let syncing: Promise<void> | null = null

/** Brings the community and the member's spaces in line with the server, and tells them about replies and posts going live. */
export function syncForum(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const { data, error } = await supabase().rpc('forum_feed')
    const d = data as { ok?: boolean; posts?: RemotePost[]; spaces?: string[] } | null
    if (error || !d || d.ok !== true || !Array.isArray(d.posts)) return
    const before = new Map(getDb().posts.map((p) => [p.id, p]))
    const posts = d.posts.map(toPost)
    for (const p of posts) {
      const prev = before.get(p.id)
      if (!p.mine || !prev) continue
      if (prev.status === 'pending' && p.status === 'published') notify.push('forum', `post:${p.id}`, 'Your post is now live', p.title, `/forum/${p.id}`)
      const known = new Set(prev.comments.map((c) => c.id))
      for (const c of p.comments) if (!c.mine && !known.has(c.id)) notify.push('forum', `reply:${c.id}`, 'New reply to your post', `${c.authorName} replied to “${p.title}”.`, `/forum/${p.id}`)
    }
    update({ posts, spaces: d.spaces ?? [] })
  })().finally(() => {
    syncing = null
  })
  return syncing
}

const needsPlan = (): Res | null => {
  const db = getDb()
  return canChat(planState(db.subscription, now())) ? null : { ok: false, error: 'The community needs an active plan.', code: 'needs-plan' }
}

export const remoteForum = {
  ...mockForum,

  async create(input: { topic: string; title: string; body: string; space?: string }): Promise<Res<{ post: ForumPost; pending: boolean }>> {
    const gate = needsPlan()
    if (gate) return gate as Res<{ post: ForumPost; pending: boolean }>
    // Checked here for a quick answer, and again on the server so the rule holds even if the app is changed.
    const check = detectBlockedContent(`${input.title}\n${input.body}`)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const space = input.space ? spaceById(input.space) : undefined
    const r = await rpc('create_post', { p_topic: space ? space.name : input.topic, p_title: input.title, p_body: input.body, p_space: input.space ?? null })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncForum()
    const id = String(r.post_id)
    const post = getDb().posts.find((p) => p.id === id)
    if (!post) return { ok: false, error: OFFLINE, code: 'network' }
    return { ok: true, value: { post, pending: r.pending === true } }
  },

  async edit(id: string, patch: { title: string; body: string }): Promise<Res> {
    const r = await rpc('edit_post', { p_post: id, p_title: patch.title, p_body: patch.body })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncForum()
    return { ok: true, value: undefined }
  },

  remove(id: string): void {
    update((s) => ({ posts: s.posts.filter((p) => !(p.id === id && p.mine)) }))
    void rpc('remove_post', { p_post: id }).then(() => syncForum())
  },

  async comment(postId: string, text: string): Promise<Res<{ comment: ForumComment }>> {
    const gate = needsPlan()
    if (gate) return gate as Res<{ comment: ForumComment }>
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a comment first.', code: 'empty' }
    const check = detectBlockedContent(t)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const r = await rpc('add_comment', { p_post: postId, p_text: t })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncForum()
    const comment = getDb().posts.find((p) => p.id === postId)?.comments.find((c) => c.id === String(r.comment_id))
    if (!comment) return { ok: false, error: OFFLINE, code: 'network' }
    return { ok: true, value: { comment } }
  },

  toggleSupport(id: string): void {
    if (needsPlan()) return void showToast('The community needs an active plan.')
    update((s) => ({ posts: s.posts.map((p) => (p.id === id ? { ...p, supportedByMe: !p.supportedByMe, supports: p.supports + (p.supportedByMe ? -1 : 1) } : p)) }))
    void rpc('toggle_support', { p_post: id }).then((r) => {
      if (!r.ok) showToast(r.error)
      return syncForum()
    })
  },

  /** The server publishes posts and adds replies; the device has no timers of its own to restart. */
  resume(): void {},
}

export const remoteSpaces = {
  ...mockSpaces,

  join(id: string): Res {
    const gate = needsPlan()
    if (gate) return { ok: false, error: 'Support spaces need an active plan.', code: 'needs-plan' }
    if (!getDb().spaces.includes(id)) update((s) => ({ spaces: [...s.spaces, id] }))
    void rpc('join_space', { p_space: id }).then((r) => {
      if (!r.ok) showToast(r.error)
      return syncForum()
    })
    return { ok: true, value: undefined }
  },

  leave(id: string): void {
    update((s) => ({ spaces: s.spaces.filter((x) => x !== id) }))
    void rpc('leave_space', { p_space: id }).then(() => syncForum())
  },

  /** There are no starter posts on the real backend. */
  ensureSeeds(): void {},
}
