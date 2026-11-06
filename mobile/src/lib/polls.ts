import type { ForumPost, PollState } from '@/api/types'
import { detectNames, explainNames } from './gossip'
import { detectBlockedContent, explainBlock } from './safety'

/** A poll is a post in one built-in room (like Gossip), so it stays out of the general feed. */
export const POLL_SPACE = 'polls'
export const POLL_TOPIC = 'Polls'
export const POLL_DAYS = 7
export const POLL_LIMITS = { minQuestion: 10, maxQuestion: 120, minOptions: 2, maxOptions: 4, maxOption: 40 }

export const isPoll = (p: Pick<ForumPost, 'space'>): boolean => p.space === POLL_SPACE

export const pollOpen = (poll: Pick<PollState, 'closesAt'>, now: number): boolean => now < poll.closesAt

/** Counts are shown once the member has voted, when the poll has closed, or when it is their own. */
export const showResults = (post: Pick<ForumPost, 'mine'>, poll: PollState, now: number): boolean => poll.myVote !== null || !pollOpen(poll, now) || post.mine

export const totalVotes = (poll: PollState): number => poll.options.reduce((n, o) => n + (o.votes ?? 0), 0)

/** Each answer's share of the votes, in whole percent. All zeros when nobody has voted. */
export function shares(poll: PollState): number[] {
  const total = totalVotes(poll)
  return poll.options.map((o) => (total ? Math.round(((o.votes ?? 0) / total) * 100) : 0))
}

/** The question and answers a member typed, tidied: blanks dropped. */
export const cleanOptions = (options: string[]): string[] => options.map((o) => o.trim()).filter(Boolean)

/** Checks a new poll. Returns a plain reason, or null when it is fine. */
export function validatePoll(question: string, options: string[]): string | null {
  const q = question.trim()
  if (q.length < POLL_LIMITS.minQuestion) return `Ask a question of at least ${POLL_LIMITS.minQuestion} characters.`
  if (q.length > POLL_LIMITS.maxQuestion) return `Keep the question under ${POLL_LIMITS.maxQuestion} characters.`
  const opts = cleanOptions(options)
  if (opts.length < POLL_LIMITS.minOptions || opts.length > POLL_LIMITS.maxOptions) return 'Give two to four answers.'
  if (opts.some((o) => o.length > POLL_LIMITS.maxOption)) return `Keep each answer under ${POLL_LIMITS.maxOption} characters.`
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Each answer must be different.'
  const all = `${q}\n${opts.join('\n')}`
  const blocked = detectBlockedContent(all)
  if (blocked.blocked) return explainBlock(blocked.reasons)
  const names = detectNames(all)
  if (names.length) return explainNames(names)
  return null
}

/** Polls as they are listed: live ones, plus the member's own that are still being checked. Newest first. */
export function pollFeed(posts: ForumPost[], hidden: string[] = [], muted: string[] = []): ForumPost[] {
  return posts
    .filter((p) => isPoll(p) && !!p.poll && p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey) && (p.status === 'published' || p.mine))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** "closes in 3 days", "closes in 5 hours", "closed". */
export function closesIn(poll: Pick<PollState, 'closesAt'>, now: number): string {
  const ms = poll.closesAt - now
  if (ms <= 0) return 'Closed'
  const h = Math.ceil(ms / 3600_000)
  return h >= 48 ? `Closes in ${Math.ceil(h / 24)} days` : h > 1 ? `Closes in ${h} hours` : 'Closes within the hour'
}
