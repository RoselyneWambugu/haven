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
  it('gets half back, and the therapist and Echo each take a quarter', () => {
    expect(memberNoShowSplit(2000)).toMatchObject({ kind: 'member-no-show', refundKes: 1000, therapistKes: 500, platformKes: 500 })
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
