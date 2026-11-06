import { describe, expect, it } from 'vitest'
import type { CommunityEvent, ForumComment, ForumPost } from '../src/api/types'
import { engagement, isSearching, repliers, resultCount, searchCommunity, searchTerms, trendingPosts, trendingReason, trendScore, TRENDING } from '../src/lib/trending'

const H = 3600_000
const NOW = 100 * 24 * H

const cm = (name: string, over: Partial<ForumComment> = {}): ForumComment => ({ id: `c-${name}-${Math.random()}`, authorName: name, authorAvatar: 'leaf', therapistId: null, therapistName: null, text: 'x', at: NOW, hiddenReason: null, mine: false, ...over })
const post = (id: string, over: Partial<ForumPost> = {}): ForumPost => ({
  id, authorName: 'RainyDay', authorAvatar: 'wave', authorKey: `k-${id}`, topic: 'Anxiety', title: `Post ${id}`, body: 'Some words in the body.', createdAt: NOW - 3 * H, supports: 10,
  supportedByMe: false, comments: [], status: 'published', mine: false, ...over,
})
const ev = (id: string, over: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id, title: 'A morning walk in the park', blurb: 'An easy group walk with a therapist alongside.', kind: 'walk', mode: 'in-person', place: 'Karura Forest', startsAt: NOW + 2 * 24 * H, durationMin: 90, host: 'Echo', interested: 5, interestedByMe: false, ...over,
})

describe('what counts toward trending', () => {
  it('counts each person who replied once, never the author, never a hidden reply', () => {
    const p = post('a', { comments: [cm('Ann'), cm('Ann'), cm('Bea'), cm('RainyDay'), cm('Cy', { hiddenReason: 'contact' })] })
    expect(repliers(p)).toBe(2)
  })
  it('weights a reply above a reaction, and gossip takes reactions only', () => {
    expect(engagement(post('a', { supports: 4, comments: [cm('Ann')] })).total).toBe(4 + TRENDING.replyWeight)
    expect(engagement(post('g', { space: 'gossip', supports: 4, comments: [cm('Ann')] })).total).toBe(4)
  })
})

describe('which posts trend', () => {
  it('puts the more reacted post first, and lets a newer one overtake an older one with the same reactions', () => {
    const a = post('a', { supports: 30, createdAt: NOW - 2 * H })
    const b = post('b', { supports: 12, createdAt: NOW - 2 * H })
    expect(trendingPosts([b, a], NOW).map((p) => p.id)).toEqual(['a', 'b'])
    const fresh = post('fresh', { supports: 20, createdAt: NOW - 1 * H })
    const stale = post('stale', { supports: 20, createdAt: NOW - 30 * H })
    expect(trendingPosts([stale, fresh], NOW).map((p) => p.id)).toEqual(['fresh', 'stale'])
    expect(trendScore(fresh, NOW)).toBeGreaterThan(trendScore(stale, NOW))
  })

  it('needs a few reactions, and ignores posts older than a week', () => {
    expect(trendingPosts([post('few', { supports: 2 })], NOW)).toEqual([])
    expect(trendingPosts([post('old', { supports: 99, createdAt: NOW - 8 * 24 * H })], NOW)).toEqual([])
    expect(trendingPosts([post('ok', { supports: 3 })], NOW)).toHaveLength(1)
  })

  it('leaves out support spaces, polls, held, hidden and muted posts, but keeps gossip', () => {
    const list = [
      post('space', { space: 'grief', supports: 80 }),
      post('poll', { space: 'polls', supports: 80 }),
      post('held', { status: 'pending', supports: 80 }),
      post('hid', { supports: 80 }),
      post('muted', { supports: 80, authorKey: 'k-muted' }),
      post('gossip', { space: 'gossip', supports: 40 }),
      post('plain', { supports: 20 }),
    ]
    const ids = trendingPosts(list, NOW, ['hid'], ['k-muted']).map((p) => p.id)
    expect(ids).toEqual(['gossip', 'plain'])
  })

  it('shows at most five', () => {
    const many = Array.from({ length: 9 }, (_, i) => post(`p${i}`, { supports: 10 + i }))
    expect(trendingPosts(many, NOW)).toHaveLength(TRENDING.limit)
  })

  it('says why in plain words', () => {
    expect(trendingReason(post('a', { supports: 34, comments: [cm('Ann'), cm('Bea')] }))).toBe('34 reactions · 2 people replied')
    expect(trendingReason(post('g', { space: 'gossip', supports: 1 }))).toBe('1 heard it')
  })
})

describe('searching the community', () => {
  const posts = [
    post('a', { title: 'Struggling to sleep before exams', body: 'My mind races at night.', topic: 'Anxiety' }),
    post('b', { title: 'Lost my dad last month', body: 'I do not know how to explain it at work.', topic: 'Grief', createdAt: NOW - H }),
    post('g', { space: 'gossip', title: 'The new matatu fares', body: 'Everyone is talking about Monday.', topic: 'Gossip' }),
    post('pl', { space: 'polls', title: 'What helps you unwind?', body: 'Poll: A long walk / Music', topic: 'Polls', poll: { options: [{ text: 'A long walk', votes: 1 }, { text: 'Music', votes: 2 }], myVote: null, closesAt: NOW + H } }),
    post('sp', { space: 'grief', title: 'A private grief space post about sleep', body: 'only members of the space', topic: 'Grief and loss' }),
    post('held', { status: 'pending', title: 'Sleep tips waiting for a check', body: 'x', mine: false }),
  ]
  const events = [ev('e1'), ev('e2', { title: 'Sleep talk', kind: 'webinar', place: 'Online', host: 'Dr. Amina' }), ev('old', { title: 'Sleep workshop that ended', startsAt: NOW - 5 * H }), ev('gone', { title: 'Sleep walk', cancelled: { reason: 'x', at: NOW } })]
  const search = (q: string, extra: { hidden?: string[]; muted?: string[] } = {}) => searchCommunity(q, { posts, events, ...extra }, NOW)

  it('wants two letters, and ignores case and accents', () => {
    expect(isSearching('s')).toBe(false)
    expect(isSearching('  sl ')).toBe(true)
    expect(searchTerms('  Café   SLEEP ')).toEqual(['cafe', 'sleep'])
    expect(resultCount(search('s'))).toBe(0)
  })

  it('finds posts, gossip, polls and events by any word in the title, text, topic, host or place', () => {
    const r = search('SLEEP')
    expect(r.posts.map((p) => p.id)).toEqual(['a'])
    expect(r.events.map((e) => e.id)).toEqual(['e2'])
    expect(search('matatu').gossip.map((p) => p.id)).toEqual(['g'])
    expect(search('long walk').polls.map((p) => p.id)).toEqual(['pl'])
    expect(search('amina').events.map((e) => e.id)).toEqual(['e2'])
    expect(search('karura').events.map((e) => e.id)).toEqual(['e1'])
  })

  it('needs every word to match', () => {
    expect(search('sleep exams').posts.map((p) => p.id)).toEqual(['a'])
    expect(resultCount(search('sleep zebra'))).toBe(0)
  })

  it('leaves out support-space posts, held, hidden and muted posts, and events that are over or cancelled', () => {
    const ids = search('sleep').posts.map((p) => p.id)
    expect(ids).not.toContain('sp')
    expect(ids).not.toContain('held')
    expect(search('sleep', { hidden: ['a'] }).posts).toEqual([])
    expect(search('sleep', { muted: ['k-a'] }).posts).toEqual([])
    expect(search('sleep').events.map((e) => e.id)).not.toContain('old')
    expect(search('sleep').events.map((e) => e.id)).not.toContain('gone')
  })
})
