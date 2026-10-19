import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { shouldAskHeard, validateFeedback, wasExchange } from '../src/lib/feedback'
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
