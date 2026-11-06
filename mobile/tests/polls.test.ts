import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { closesIn, isPoll, pollFeed, shares, showResults, validatePoll } from '../src/lib/polls'
import { generalPosts } from '../src/lib/spaces'
import { freshState, getDb, update } from '../src/store/db'

const register = () => {
  api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
  api.auth.acceptConsents()
  const otp = api.auth.requestOtp('register')
  if (!otp.ok) throw new Error('otp')
  api.auth.verifyOtp(otp.value.demoCode)
  api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
  api.auth.completeRegistration('web')
  api.demo.grantPlan('monthly')
}
const Q = 'What is the best way to wind down?'

describe('checking a poll', () => {
  it('accepts a good one', () => expect(validatePoll(Q, ['A long walk', 'Music', 'Sleep'])).toBeNull())
  it('wants a real question and two to four different answers', () => {
    expect(validatePoll('Short?', ['Yes', 'No'])).toMatch(/question/)
    expect(validatePoll(Q, ['Only one'])).toMatch(/two to four/)
    expect(validatePoll(Q, ['A', 'B', 'C', 'D', 'E'])).toMatch(/two to four/)
    expect(validatePoll(Q, ['Walk', 'walk'])).toMatch(/different/)
    expect(validatePoll(Q, ['x'.repeat(41), 'Music'])).toMatch(/under 40/)
    expect(validatePoll(Q, ['Walk', '', 'Music'])).toBeNull()
  })
  it('refuses contact details and names', () => {
    expect(validatePoll(Q, ['Call 0712 345 678', 'No'])).toMatch(/phone|contact|number/i)
    expect(validatePoll('Should Wanjiku quit her job this year?', ['Yes', 'No'])).toMatch(/name/)
  })
})

describe('what a poll shows', () => {
  const poll = (myVote: number | null, closesAt: number, votes: (number | null)[] = [3, 1]) => ({ myVote, closesAt, options: votes.map((v, i) => ({ text: `Answer ${i}`, votes: v })) })
  it('hides the counts until the member has voted, the poll has closed, or it is theirs', () => {
    expect(showResults({ mine: false }, poll(null, 1000), 0)).toBe(false)
    expect(showResults({ mine: false }, poll(1, 1000), 0)).toBe(true)
    expect(showResults({ mine: false }, poll(null, 1000), 2000)).toBe(true)
    expect(showResults({ mine: true }, poll(null, 1000), 0)).toBe(true)
  })
  it('gives each answer its share, and zeros when nobody has voted', () => {
    expect(shares(poll(0, 1, [3, 1]))).toEqual([75, 25])
    expect(shares(poll(0, 1, [0, 0]))).toEqual([0, 0])
    expect(shares(poll(null, 1, [null, null]))).toEqual([0, 0])
  })
  it('says how long is left', () => {
    expect(closesIn({ closesAt: 3 * 24 * 3600_000 }, 0)).toBe('Closes in 3 days')
    expect(closesIn({ closesAt: 5 * 3600_000 }, 0)).toBe('Closes in 5 hours')
    expect(closesIn({ closesAt: 10 }, 20)).toBe('Closed')
  })
})

describe('polls in the app', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    register()
  })

  it('come with a few starter polls, kept out of the general feed', () => {
    const polls = pollFeed(getDb().posts)
    expect(polls.length).toBeGreaterThanOrEqual(3)
    for (const p of polls) expect(generalPosts(getDb().posts).some((x) => x.id === p.id)).toBe(false)
  })

  it('need a plan to ask or vote', () => {
    update({ subscription: null })
    expect(api.forum.createPoll({ question: Q, options: ['Walk', 'Music'] })).toMatchObject({ ok: false, code: 'needs-plan' })
    expect(api.forum.vote(pollFeed(getDb().posts)[0].id, 0)).toMatchObject({ ok: false, code: 'needs-plan' })
  })

  it('let a member vote once, then show the counts with the vote added', () => {
    const p = pollFeed(getDb().posts)[0]
    const before = p.poll!.options[1].votes!
    expect(api.forum.vote(p.id, 1).ok).toBe(true)
    const after = getDb().posts.find((x) => x.id === p.id)!.poll!
    expect(after).toMatchObject({ myVote: 1 })
    expect(after.options[1].votes).toBe(before + 1)
    expect(api.forum.vote(p.id, 0)).toMatchObject({ ok: false, code: 'voted' })
    expect(api.forum.vote(p.id, 9)).toMatchObject({ ok: false })
  })

  it('refuse a vote once the poll has closed', () => {
    const p = pollFeed(getDb().posts)[0]
    advanceClock(8 * 24 * 60)
    api.demo.grantPlan('monthly')
    expect(api.forum.vote(p.id, 0)).toMatchObject({ ok: false, code: 'closed' })
  })

  it('are asked with two to four answers, show the asker the counts at once, and take no replies or edits', () => {
    update((s) => ({ account: { ...s.account!, hasPostedBefore: true } }))
    const r = api.forum.createPoll({ question: Q, options: ['A long walk', 'Music', ' ', 'Sleep'] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = getDb().posts.find((x) => x.id === r.value.post.id)!
    expect(isPoll(p)).toBe(true)
    expect(p.poll!.options.map((o) => o.text)).toEqual(['A long walk', 'Music', 'Sleep'])
    expect(showResults(p, p.poll!, now())).toBe(true)
    expect(api.forum.comment(p.id, 'Nice question')).toMatchObject({ ok: false, code: 'gossip' })
    expect(api.forum.edit(p.id, { title: 'Another question entirely', body: 'Poll: x / y' })).toMatchObject({ ok: false, code: 'poll' })
    expect(api.forum.createPoll({ question: 'Should Wanjiku quit her job this year?', options: ['Yes', 'No'] })).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('hold a first poll for checking, like a first post', () => {
    const r = api.forum.createPoll({ question: Q, options: ['Walk', 'Music'] })
    expect(r).toMatchObject({ ok: true, value: { pending: true } })
  })
})
