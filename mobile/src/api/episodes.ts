import { DEMO_COMMENTS, DEMO_LIKES, DEMO_VIDEO, demoEpisodes } from '@/data/episodes'
import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import type { PickedFile } from '@/backend/remoteDocuments'
import { requirePlan } from './access'
import type { Episode, EpisodeComment, EpisodePlay, ReportReason, Res, StaffEpisode } from './types'

/** What staff give to add an episode: the words, the video file, and an optional picture. */
export interface NewEpisode {
  title: string
  blurb: string
  video: PickedFile
  poster?: PickedFile | null
  durationSec?: number | null
}

const LIVE_ONLY: Res<never> = { ok: false, error: 'Adding episodes is only on the live service.', code: 'unavailable' }
const MAX_COMMENT = 1000
const social = () => getDb().episodeSocial ?? { reactions: {}, comments: [] }

const reactionOf = (id: string): -1 | 0 | 1 => social().reactions[id] ?? 0
const likesOf = (id: string): number => (DEMO_LIKES[id] ?? 0) + (reactionOf(id) === 1 ? 1 : 0)
const commentsOf = (id: string): number => (DEMO_COMMENTS[id]?.length ?? 0) + social().comments.filter((c) => c.id.startsWith(`${id}:`)).length

/** Watch in the demo: three sample episodes that all play the same short public clip. Nothing is uploaded. */
export const episodes = {
  /** The published episodes, newest first. Needs an active plan, like the rest of Echo. */
  async list(): Promise<Res<Episode[]>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<Episode[]>
    return { ok: true, value: demoEpisodes(now()).map((e) => ({ ...e, likes: likesOf(e.id), comments: commentsOf(e.id), myReaction: reactionOf(e.id) })) }
  },

  /** One episode, ready to play. */
  async play(id: string): Promise<Res<EpisodePlay>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<EpisodePlay>
    const e = demoEpisodes(now()).find((x) => x.id === id)
    if (!e) return { ok: false, error: 'That episode isn’t available.', code: 'gone' }
    return { ok: true, value: { title: e.title, blurb: e.blurb, durationSec: e.durationSec, videoUrl: DEMO_VIDEO, posterUrl: null, likes: likesOf(id), comments: commentsOf(id), myReaction: reactionOf(id) } }
  },

  /** Like (1), dislike (-1) or clear (0). A member has one reaction per episode. Returns the like count and their reaction. */
  async react(id: string, value: -1 | 0 | 1): Promise<Res<{ likes: number; myReaction: -1 | 0 | 1 }>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<{ likes: number; myReaction: -1 | 0 | 1 }>
    if (!demoEpisodes(now()).some((e) => e.id === id)) return { ok: false, error: 'That episode isn’t available.', code: 'gone' }
    update((s) => ({ episodeSocial: { ...(s.episodeSocial ?? { reactions: {}, comments: [] }), reactions: { ...social().reactions, [id]: value } } }))
    return { ok: true, value: { likes: likesOf(id), myReaction: value } }
  },

  /** The comments under an episode, oldest first. */
  async comments(id: string): Promise<Res<EpisodeComment[]>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<EpisodeComment[]>
    const seeded = (DEMO_COMMENTS[id] ?? []).map((c, i): EpisodeComment => ({ id: `seed:${id}:${i}`, authorName: c.name, authorAvatar: c.avatar, authorKey: `peer-${c.name}`, text: c.text, at: now() - c.hoursAgo * 3600_000, mine: false }))
    const mine = social().comments.filter((c) => c.id.startsWith(`${id}:`))
    return { ok: true, value: [...seeded, ...mine].sort((a, b) => a.at - b.at) }
  },

  /** Adds a comment. Phone numbers, links and addresses are refused, as everywhere in Echo. */
  async addComment(id: string, text: string): Promise<Res<void>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<void>
    const a = getDb().account
    if (!a) return { ok: false, error: 'Sign in first.' }
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a comment first.', code: 'empty' }
    if (t.length > MAX_COMMENT) return { ok: false, error: 'That comment is too long. Keep it under 1000 characters.', code: 'too-long' }
    const blocked = detectBlockedContent(t)
    if (blocked.blocked) return { ok: false, error: explainBlock(blocked.reasons), code: 'blocked' }
    const c: EpisodeComment = { id: `${id}:${uid('c')}`, authorName: a.public.penName, authorAvatar: a.public.avatar, authorKey: 'me', text: t, at: now(), mine: true }
    update((s) => ({ episodeSocial: { ...(s.episodeSocial ?? { reactions: {}, comments: [] }), comments: [...social().comments, c] } }))
    return { ok: true, value: undefined }
  },

  /** A member removes their own comment. */
  async removeComment(commentId: string): Promise<Res<void>> {
    if (!social().comments.some((c) => c.id === commentId && c.mine)) return { ok: false, error: 'That comment isn’t here.', code: 'gone' }
    update((s) => ({ episodeSocial: { ...(s.episodeSocial ?? { reactions: {}, comments: [] }), comments: social().comments.filter((c) => c.id !== commentId) } }))
    return { ok: true, value: undefined }
  },

  /** Reports someone else's comment. In the demo this only says thank you. */
  async reportComment(_commentId: string, _reason: ReportReason): Promise<Res<void>> {
    showToast('Thank you. A moderator will look at this.')
    return { ok: true, value: undefined }
  },

  /** Staff: every episode. In the demo they are the sample ones and can't be changed. */
  async staffList(): Promise<Res<StaffEpisode[]>> {
    return {
      ok: true,
      value: demoEpisodes(now()).map((e) => ({
        id: e.id, title: e.title, blurb: e.blurb, status: 'published' as const, durationSec: e.durationSec, sizeBytes: null, publishedAt: e.publishedAt, createdBy: 'Demo', createdAt: e.publishedAt,
        likes: likesOf(e.id), dislikes: reactionOf(e.id) === -1 ? 1 : 0, comments: commentsOf(e.id),
      })),
    }
  },

  async add(_input: NewEpisode, _onProgress?: (pct: number) => void): Promise<Res<{ id: string }>> {
    return LIVE_ONLY
  },
  async edit(_id: string, _title: string, _blurb: string): Promise<Res> {
    return LIVE_ONLY
  },
  async setPublished(_id: string, _publish: boolean): Promise<Res> {
    return LIVE_ONLY
  },
}
