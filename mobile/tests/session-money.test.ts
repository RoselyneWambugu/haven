import { describe, expect, it } from 'vitest'
import { MIN } from '../src/lib/booking'
import { cancelSplit, cancelWords, canReportTherapistLate, memberNoShowSplit, therapistLateAt, therapistNoShowSplit } from '../src/lib/sessionMoney'

const start = 10_000 * MIN
const money = (n: number | null) => `KES ${n}`
const adds = (s: { paidKes: number; refundKes: number; therapistKes: number; platformKes: number }) => s.refundKes + s.therapistKes + s.platformKes === s.paidKes

describe('cancelling a paid session', () => {
  it('returns everything when it is more than an hour before', () => {
    const s = cancelSplit(start, start - 61 * MIN, 2000)
    expect(s).toMatchObject({ kind: 'free', refundKes: 2000, therapistKes: 0, platformKes: 0 })
  })
  it('keeps 10% in the last hour, shared between the therapist and Echo', () => {
    const s = cancelSplit(start, start - 60 * MIN, 2000)
    expect(s).toMatchObject({ kind: 'late-cancel', refundKes: 1800, therapistKes: 100, platformKes: 100 })
    expect(adds(s)).toBe(true)
  })
  it('keeps the fee when it is cancelled after it began', () => {
    expect(cancelSplit(start, start + 5 * MIN, 1500).refundKes).toBe(1350)
  })
  it('always adds up, whatever the price', () => {
    for (const p of [1, 99, 750, 1333, 2500]) {
      expect(adds(cancelSplit(start, start - 10 * MIN, p))).toBe(true)
      expect(adds(memberNoShowSplit(p))).toBe(true)
    }
  })
})

describe('a member who does not come', () => {
  it('gets 85% back, Echo keeps the rest and the therapist earns nothing', () => {
    expect(memberNoShowSplit(2000)).toMatchObject({ kind: 'member-no-show', refundKes: 1700, therapistKes: 0, platformKes: 300 })
  })
})

describe('a therapist who does not come', () => {
  it('is waited for 15 minutes, then the member may leave with everything back', () => {
    expect(therapistLateAt(start)).toBe(start + 15 * MIN)
    expect(canReportTherapistLate(start, start + 45 * MIN, start + 14 * MIN)).toBe(false)
    expect(canReportTherapistLate(start, start + 45 * MIN, start + 15 * MIN)).toBe(true)
    expect(canReportTherapistLate(start, start + 45 * MIN, start + 46 * MIN)).toBe(false)
    expect(therapistNoShowSplit(2000)).toMatchObject({ kind: 'therapist-no-show', refundKes: 2000, therapistKes: 0, platformKes: 0 })
  })
})

describe('what the cancel screen says', () => {
  it('names the amount that comes back and the fee', () => {
    expect(cancelWords(cancelSplit(start, start - 120 * MIN, 2000), money)).toMatch(/all KES 2000 goes back/)
    const late = cancelWords(cancelSplit(start, start - 20 * MIN, 2000), money)
    expect(late).toMatch(/10% fee \(KES 200\)/)
    expect(late).toMatch(/KES 1800 goes back/)
  })
})

import { FLAKE_STARS, liveStars, summarise } from '../src/lib/ratings'
describe('a therapist who does not come', () => {
  it('counts as a 1-star rating on their profile, whatever else was given', () => {
    const sessions = [
      { therapistId: 't1', rating: { stars: 5, comment: '' }, flaked: false },
      { therapistId: 't1', rating: null, flaked: true },
      { therapistId: 't2', rating: null, flaked: true },
    ]
    expect(liveStars(sessions, 't1')).toEqual([5, FLAKE_STARS])
    expect(liveStars(sessions, 't2')).toEqual([FLAKE_STARS])
  })
  it('pulls their average down', () => {
    const base = { rating: 4.8, reviews: 20 }
    const before = summarise(base).average!
    const after = summarise(base, [FLAKE_STARS]).average!
    expect(after).toBeLessThan(before)
    expect(after).toBe(4.6)
  })
})

import { canMarkNoShow, discountedKes, flakeOffer } from '../src/lib/sessionMoney'
describe('a client who joined', () => {
  it('cannot be marked a no-show, even when they were late', () => {
    expect(canMarkNoShow(null)).toBe(true)
    expect(canMarkNoShow(undefined)).toBe(true)
    expect(canMarkNoShow(start + 10 * MIN)).toBe(false)
  })
})

describe('the discount after a therapist misses a session', () => {
  const missed = { id: 's1', therapistId: 't1', flaked: true, flakeDiscountPct: 10, flakeDiscountUntil: start + 90 * 24 * 60 * MIN, discountUsed: false }
  it('is for the next booking with that same therapist only', () => {
    expect(flakeOffer([missed], 't1', start)).toEqual({ sessionId: 's1', pct: 10, until: missed.flakeDiscountUntil })
    expect(flakeOffer([missed], 't2', start)).toBeNull()
  })
  it('is used once and expires', () => {
    expect(flakeOffer([{ ...missed, discountUsed: true }], 't1', start)).toBeNull()
    expect(flakeOffer([missed], 't1', missed.flakeDiscountUntil + 1)).toBeNull()
    expect(flakeOffer([{ ...missed, flakeDiscountPct: null }], 't1', start)).toBeNull()
  })
  it('takes 10% off the listed price', () => {
    expect(discountedKes(1500, 10)).toBe(1350)
    expect(discountedKes(1333, 10)).toBe(1200)
  })
})

import { FLAKE_RULE, flakeNotice, flakeStanding, missedIn } from '../src/lib/sessionMoney'
describe('a therapist who keeps missing sessions', () => {
  const day = 24 * 60 * MIN
  const missedAt = (t: string, daysAgo: number) => ({ therapistId: t, flaked: true, start: start - daysAgo * day })
  it('is counted over the last 60 days, for that therapist only', () => {
    const list = [missedAt('t1', 1), missedAt('t1', 59), missedAt('t1', 61), missedAt('t2', 1), { therapistId: 't1', flaked: false, start: start - day }]
    expect(missedIn(list, 't1', start)).toBe(2)
    expect(missedIn(list, 't2', start)).toBe(1)
  })
  it('is warned at 2 and paused at 3', () => {
    expect([0, 1, 2, 3, 4].map(flakeStanding)).toEqual(['ok', 'ok', 'warning', 'paused', 'paused'])
    expect(FLAKE_RULE).toMatchObject({ warnAt: 2, pauseAt: 3 })
  })
  it('is told in plain words what happens next', () => {
    expect(flakeNotice(2)).toMatch(/missed 2 sessions in the last 60 days/)
    expect(flakeNotice(2)).toMatch(/1 more/)
    expect(flakeNotice(3)).toMatch(/New clients are paused/)
    expect(flakeNotice(3)).toMatch(/You can appeal/)
  })
})

import { afterEach } from 'vitest'
import { changeOutcome } from '../src/lib/booking'
import { applySessionMoney, DEFAULT_SESSION_MONEY, lastWindow, SESSION_MONEY, validateSessionMoney } from '../src/lib/sessionMoney'

describe('the numbers an Admin can change', () => {
  afterEach(() => applySessionMoney(DEFAULT_SESSION_MONEY))
  it('checks them the way the server does', () => {
    const d = DEFAULT_SESSION_MONEY
    expect(validateSessionMoney(d)).toBeNull()
    expect(validateSessionMoney({ ...d, noShowRefundPct: 90, noShowTherapistPct: 20 })).toMatch(/more than 100/)
    expect(validateSessionMoney({ ...d, lateCancelFeePct: 101 })).toMatch(/0 to 100/)
    expect(validateSessionMoney({ ...d, therapistWaitMinutes: 2 })).toMatch(/5 to 60/)
    expect(validateSessionMoney({ ...d, flakeWarnAt: 4, flakePauseAt: 4 })).toMatch(/after the warning/)
    expect(validateSessionMoney({ ...d, flakeWarnAt: 0, flakePauseAt: 0, flakeDiscountPct: 0 })).toBeNull()
    expect(validateSessionMoney({ ...d, lateCancelMinutes: 10.5 })).toMatch(/whole/)
    expect(validateSessionMoney({ ...d, flakeWindowDays: 3 })).toMatch(/7 to 365/)
  })
  it('changes what the rules do once applied', () => {
    applySessionMoney({ lateCancelMinutes: 120, lateCancelFeePct: 20, lateCancelTherapistSharePct: 100, noShowRefundPct: 70, noShowTherapistPct: 10, flakeWarnAt: 3, flakePauseAt: 5, flakeWindowDays: 90, therapistWaitMinutes: 20 })
    // 90 minutes out is now a late cancellation costing 20%, all of it to the therapist
    expect(cancelSplit(start, start - 90 * MIN, 2000)).toMatchObject({ kind: 'late-cancel', refundKes: 1600, therapistKes: 400, platformKes: 0 })
    expect(changeOutcome(start, start - 90 * MIN)).toBe('late')
    expect(memberNoShowSplit(2000)).toMatchObject({ refundKes: 1400, therapistKes: 200, platformKes: 400 })
    expect(SESSION_MONEY.noShowPlatformPct).toBe(20)
    expect(therapistLateAt(start)).toBe(start + 20 * MIN)
    expect([2, 3, 4, 5].map(flakeStanding)).toEqual(['ok', 'warning', 'warning', 'paused'])
    expect(flakeNotice(3)).toMatch(/last 90 days/)
  })
  it('keeps a starting value for anything missing, and puts the defaults back', () => {
    applySessionMoney({ lateCancelFeePct: 30, flakePauseAt: Number.NaN } as never)
    expect(SESSION_MONEY.lateCancelFeePct).toBe(30)
    expect(SESSION_MONEY.flakePauseAt).toBe(3)
    applySessionMoney(null)
    expect(SESSION_MONEY.lateCancelFeePct).toBe(10)
  })
  it('names the window in plain words', () => {
    expect([30, 60, 90, 120].map((m) => lastWindow(m))).toEqual(['the last 30 minutes', 'the last hour', 'the last 90 minutes', 'the last 2 hours'])
  })
})
