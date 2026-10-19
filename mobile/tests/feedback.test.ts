import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { shouldAskHeard, summariseHeard, triage, validateFeedback, wasExchange } from '../src/lib/feedback'
import { canAccess } from '../src/lib/admin'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'
import type { Conversation, Message } from '../src/api'

const m = (from: Message['from'], i: number): Message => ({ id: `m${i}`, from, text: 'hi', at: i })
const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'c1', kind: 'peer', peer: null, therapistId: null, messages: [m('me', 1), m('them', 2), m('me', 3)],
  muted: false, archived: false, ended: true, disappearing: 'off', unread: 0, createdAt: 0, lastAt: 0, ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  resetClock()
  update(freshState())
})

describe('the felt-heard prompt', () => {
  it('asks once after a real exchange in an ended peer chat', () => {
    expect(shouldAskHeard(conv())).toBe(true)
  })
  it('does not ask while the chat is open, for therapist chats, or after an answer or skip', () => {
    expect(shouldAskHeard(conv({ ended: false }))).toBe(false)
    expect(shouldAskHeard(conv({ kind: 'therapist' }))).toBe(false)
    expect(shouldAskHeard(conv({ heard: 'skipped' }))).toBe(false)
    expect(shouldAskHeard(conv({ heard: { score: 4, comment: '' } }))).toBe(false)
  })
  it('does not ask when only one side wrote or nobody replied', () => {
    expect(wasExchange({ messages: [m('me', 1), m('me', 2), m('me', 3)] })).toBe(false)
    expect(wasExchange({ messages: [m('me', 1)] })).toBe(false)
    expect(wasExchange({ messages: [m('me', 1), m('them', 2)] })).toBe(true)
  })
})

describe('feedback api', () => {
  it('saves a rating on the conversation only, and rejects an unknown face', () => {
    update({ conversations: [conv()] })
    expect(api.feedback.rateHeard('c1', 9, '').ok).toBe(false)
    expect(api.feedback.rateHeard('c1', 4, '  thanks  ').ok).toBe(true)
    expect(getDb().conversations[0].heard).toEqual({ score: 4, comment: 'thanks' })
    expect(getDb().feedback).toHaveLength(0)
  })
  it('skipping is recorded without a score', () => {
    update({ conversations: [conv()] })
    api.feedback.skipHeard('c1')
    expect(getDb().conversations[0].heard).toBe('skipped')
  })
  it('stores a note and refuses an empty or very long one', () => {
    expect(validateFeedback('   ')).not.toBeNull()
    expect(validateFeedback('x'.repeat(1001))).not.toBeNull()
    expect(api.feedback.send('bug', '', true).ok).toBe(false)
    expect(api.feedback.send('bug', ' The chat froze ', false).ok).toBe(true)
    expect(getDb().feedback[0]).toMatchObject({ kind: 'bug', text: 'The chat froze', withDevice: false })
  })
})

describe('staff view of feedback', () => {
  const answered = (n: number, score = 4): Pick<Conversation, 'heard'>[] => Array.from({ length: n }, () => ({ heard: { score, comment: 'private' } }))

  it('hides the felt-heard results until ten people have answered', () => {
    expect(summariseHeard(answered(9)).answered).toBeNull()
    const s = summariseHeard([...answered(8, 5), ...answered(2, 2)])
    expect(s.answered).toBe(10)
    expect(s.positive).toBe(80)
    expect(s.shares).toEqual([0, 20, 0, 0, 80])
  })
  it('puts unread notes first', () => {
    const base = { kind: 'idea' as const, withDevice: false }
    const out = triage([
      { ...base, id: 'a', text: 'old read', at: 1, reviewedBy: 'X' },
      { ...base, id: 'b', text: 'old', at: 2 },
      { ...base, id: 'c', text: 'new', at: 3 },
    ])
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a'])
  })
  it('lets roles with the Feedback module mark a note read, and logs it', () => {
    api.feedback.send('bug', 'It froze', false)
    const id = getDb().feedback[0].id
    expect(api.feedback.review(id)).toMatchObject({ ok: false, code: 'role' })
    expect(api.admin.signIn('S. Kamau', '135790').ok).toBe(true)
    expect(api.feedback.review(id).ok).toBe(true)
    expect(getDb().feedback[0].reviewedBy).toBe('S. Kamau')
    expect(getDb().admin!.audit[0].action).toBe('Marked feedback as read')
  })
  it('keeps moderators and clinical reviewers out', () => {
    expect(canAccess('moderator', 'feedback')).toBe(false)
    expect(canAccess('clinical', 'feedback')).toBe(false)
    expect(canAccess('billing', 'feedback')).toBe(true)
    expect(canAccess('admin', 'feedback')).toBe(true)
  })
})
