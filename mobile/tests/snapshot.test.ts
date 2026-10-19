import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { chatSnapshot, commentSnapshot, postSnapshot, priorReports, CONTEXT_MESSAGES, FLAGGED_MESSAGES } from '../src/lib/snapshot'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'
import type { Conversation, ForumPost, Message } from '../src/api'

const m = (i: number, from: Message['from'], text = `msg ${i}`): Message => ({ id: `m${i}`, from, text, at: i })

beforeEach(() => {
  vi.useFakeTimers()
  resetClock()
  update(freshState())
})

describe('chat snapshot', () => {
  it('keeps the last messages for context and flags the other person’s latest', () => {
    const msgs = Array.from({ length: 14 }, (_, i) => m(i, i % 2 ? 'them' : 'me'))
    const snap = chatSnapshot(msgs)
    expect(snap).toHaveLength(CONTEXT_MESSAGES)
    expect(snap.filter((l) => l.reported)).toHaveLength(FLAGGED_MESSAGES)
    expect(snap.every((l) => (l.who === 'reporter') === !msgs.find((x) => x.text === l.text && x.from === 'them'))).toBe(true)
    expect(snap.filter((l) => l.reported).every((l) => l.who === 'reported')).toBe(true)
  })
  it('leaves out system lines and shortens very long messages', () => {
    const snap = chatSnapshot([m(1, 'system', 'You’re matched'), m(2, 'them', 'x'.repeat(900))])
    expect(snap).toHaveLength(1)
    expect(snap[0].text.length).toBeLessThanOrEqual(501)
  })
})

describe('forum snapshots', () => {
  const post = {
    title: 'Hard week', body: 'It was a hard week.',
    comments: [{ id: 'c1', text: 'Hang in there' }, { id: 'c2', text: 'Rude reply' }, { id: 'c3', text: 'Later' }],
  } as unknown as ForumPost
  it('keeps a post whole', () => {
    expect(postSnapshot(post)).toEqual([{ id: 'e0', who: 'reported', text: 'Hard week\nIt was a hard week.', reported: true }])
  })
  it('keeps a comment with its post and the comment before it', () => {
    const snap = commentSnapshot(post, 'c2')
    expect(snap.map((l) => l.text)).toEqual(['Post: Hard week', 'Hang in there', 'Rude reply'])
    expect(snap.filter((l) => l.reported)).toHaveLength(1)
    expect(commentSnapshot(post, 'nope')).toEqual([])
  })
})

describe('prior history', () => {
  it('counts earlier reports against the same person only', () => {
    const rs = [{ targetId: 'a', at: 1 }, { targetId: 'a', at: 5 }, { targetId: 'b', at: 2 }]
    expect(priorReports(rs, 'a', 10)).toBe(2)
    expect(priorReports(rs, 'a', 5)).toBe(1)
    expect(priorReports(rs, 'b', 1)).toBe(0)
  })
})

describe('report to case', () => {
  const conv = (): Conversation => ({
    id: 'c1', kind: 'peer', peer: { id: 'p-rainy', penName: 'RainyDay', avatar: 'moon', ageBand: '25-34', languages: ['English'] } as never, therapistId: null,
    messages: [m(1, 'me', 'Please stop'), m(2, 'them', 'You will regret this')], muted: false, archived: false, ended: false, disappearing: 'off', unread: 0, createdAt: 0, lastAt: 0,
  })

  it('freezes the conversation in the case, even if the chat is later changed', () => {
    update({ conversations: [conv()] })
    api.report.submit({ target: 'member', targetId: 'p-rainy', reason: 'threats', note: '', conversationId: 'c1' })
    update((s) => ({ conversations: s.conversations.map((c) => ({ ...c, messages: [] })) }))
    expect(api.admin.signIn('S. Kamau', DEMO_MFA).ok).toBe(true)
    api.admin.syncReports()
    const c = getDb().admin!.cases.find((x) => x.id.startsWith('C-r'))!
    expect(c.reported).toBe('RainyDay')
    expect(c.evidence.map((e) => e.text)).toEqual(['Please stop', 'You will regret this'])
    expect(c.evidence[1]).toMatchObject({ who: 'reported', reported: true })
  })
  it('carries the prior report count into the next case', () => {
    update({ conversations: [conv()] })
    api.report.submit({ target: 'member', targetId: 'p-rainy', reason: 'harassment', note: '', conversationId: 'c1' })
    vi.setSystemTime(Date.now() + 60_000)
    api.report.submit({ target: 'member', targetId: 'p-rainy', reason: 'threats', note: '', conversationId: 'c1' })
    expect(getDb().reports.map((r) => r.priorReports)).toEqual([0, 1])
  })
  it('keeps a snapshot when someone blocks and reports', () => {
    update({ conversations: [conv()] })
    api.chat.block('c1', true)
    expect(getDb().conversations).toHaveLength(0)
    expect(getDb().reports[0].snapshot).toHaveLength(2)
  })
})
