import type { CommunityEvent, ForumPost } from '@/api/types'
import { isGossip } from './gossip'
import { isPoll } from './polls'
import { isLive, isOver } from './events'

/**
 * How a post trends. Everything here is in the open: the rule is the same for every post, nobody (staff included) can pin or boost a post,
 * and it uses only what is already public on the post.
 */
export const TRENDING = {
  /** Only posts from this many days count. */
  windowDays: 7,
  /** A post needs at least this many reactions plus people who replied before it can trend, so one or two reactions never do. */
  minEngagement: 3,
  /** A reply counts for this many reactions, because it takes more effort. */
  replyWeight: 2,
  /** Older posts fade: the score is divided by (hours old + 2) to this power. */
  fade: 1.5,
  /** How many are shown. */
  limit: 5,
}

const HOUR = 3600_000

/** The number of different people (other than the author) who replied. A person replying ten times counts once, and hidden replies count for nothing. */
export function repliers(post: Pick<ForumPost, 'comments' | 'authorName'>): number {
  const names = new Set<string>()
  for (const c of post.comments) {
    if (c.hiddenReason) continue
    if (c.authorName === post.authorName) continue
    names.add(c.authorName)
  }
  return names.size
}

/** Reactions (one per person) plus the people who replied, weighted. Gossip takes reactions only. */
export function engagement(post: ForumPost): { reactions: number; repliers: number; total: number } {
  const r = isGossip(post) ? 0 : repliers(post)
  return { reactions: post.supports, repliers: r, total: post.supports + r * TRENDING.replyWeight }
}

export function trendScore(post: ForumPost, now: number): number {
  const hours = Math.max(0, (now - post.createdAt) / HOUR)
  return engagement(post).total / Math.pow(hours + 2, TRENDING.fade)
}

/** Posts that can trend: the community feed and gossip. Posts in support spaces stay in their space, and polls have their own place. */
const eligible = (p: ForumPost): boolean => (!p.space || isGossip(p)) && !isPoll(p)

export function trendingPosts(posts: ForumPost[], now: number, hidden: string[] = [], muted: string[] = []): ForumPost[] {
  const cutoff = now - TRENDING.windowDays * 24 * HOUR
  return posts
    .filter((p) => eligible(p) && p.status === 'published' && !hidden.includes(p.id) && !muted.includes(p.authorKey) && p.createdAt >= cutoff)
    .filter((p) => repliersOrZero(p) + p.supports >= TRENDING.minEngagement)
    .map((p) => ({ p, s: trendScore(p, now) }))
    .sort((a, b) => b.s - a.s || b.p.createdAt - a.p.createdAt)
    .slice(0, TRENDING.limit)
    .map((x) => x.p)
}
const repliersOrZero = (p: ForumPost): number => (isGossip(p) ? 0 : repliers(p))

/** "34 reactions · 2 people replied", the plain reason a post is on the list. */
export function trendingReason(post: ForumPost): string {
  const e = engagement(post)
  const parts = [`${e.reactions} ${isGossip(post) ? 'heard it' : e.reactions === 1 ? 'reaction' : 'reactions'}`]
  if (e.repliers) parts.push(`${e.repliers} ${e.repliers === 1 ? 'person' : 'people'} replied`)
  return parts.join(' · ')
}

/** The rule in words, for the “How trending works” sheet. */
export const TRENDING_RULES: string[] = [
  `Only posts from the last ${TRENDING.windowDays} days count.`,
  'Each person’s reaction counts once. A reply counts for more, and a person who replies several times counts once.',
  `A post needs at least ${TRENDING.minEngagement} reactions and repliers before it can trend.`,
  'Newer posts rise faster, and any post fades as it gets older, so the list keeps moving.',
  'Posts in support spaces never trend, and neither do posts you have hidden or muted. Hidden replies don’t count.',
  'Nobody can pin, boost or buy a place. Echo’s staff can’t choose what trends: it is the same rule for every post.',
]

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SEARCH = { minChars: 2, maxChars: 60, perSection: 10 }

export interface SearchResults {
  posts: ForumPost[]
  gossip: ForumPost[]
  polls: ForumPost[]
  events: CommunityEvent[]
}

const norm = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** Words of a query, lower-cased. A post or event matches when every word appears somewhere in it. */
export function searchTerms(query: string): string[] {
  return norm(query.trim().slice(0, SEARCH.maxChars)).split(/\s+/).filter(Boolean)
}

export const isSearching = (query: string): boolean => query.trim().length >= SEARCH.minChars

const hit = (haystack: string, terms: string[]): boolean => {
  const h = norm(haystack)
  return terms.every((t) => h.includes(t))
}

/**
 * Searches what the app has already loaded: the community feed, gossip, polls and upcoming events. Nothing is sent anywhere, so what someone
 * looks for stays on their phone. Posts in support spaces are left out, as are hidden ones and the member's muted authors.
 */
export function searchCommunity(query: string, src: { posts: ForumPost[]; events: CommunityEvent[]; hidden?: string[]; muted?: string[] }, now: number): SearchResults {
  const empty: SearchResults = { posts: [], gossip: [], polls: [], events: [] }
  if (!isSearching(query)) return empty
  const terms = searchTerms(query)
  const hidden = src.hidden ?? []
  const muted = src.muted ?? []
  const visible = src.posts
    .filter((p) => (!p.space || isGossip(p) || isPoll(p)) && p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey) && (p.status === 'published' || p.mine))
    .filter((p) => hit(`${p.title} ${p.body} ${p.topic}`, terms))
    .sort((a, b) => b.createdAt - a.createdAt)
  const events = src.events
    .filter((e) => isLive(e) && !e.cancelled && !isOver(e, now) && hit(`${e.title} ${e.blurb} ${e.kind} ${e.host} ${e.place}`, terms))
    .sort((a, b) => a.startsAt - b.startsAt)
  const cap = <T,>(l: T[]): T[] => l.slice(0, SEARCH.perSection)
  return {
    posts: cap(visible.filter((p) => !p.space)),
    gossip: cap(visible.filter((p) => isGossip(p))),
    polls: cap(visible.filter((p) => isPoll(p) && !!p.poll)),
    events: cap(events),
  }
}

export const resultCount = (r: SearchResults): number => r.posts.length + r.gossip.length + r.polls.length + r.events.length
