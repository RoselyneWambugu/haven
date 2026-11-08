import { describe, expect, it } from 'vitest'
import { nextSession } from '../src/lib/nextSession'

const H = 3600_000
const s = (id: string, start: number, status: 'booked' | 'completed' | 'cancelled' = 'booked') => ({ id, status, start, end: start + 45 * 60_000 })

describe('the next session on the Therapists page', () => {
  it('is the soonest booked one that has not ended', () => {
    const r = nextSession([s('late', 30 * H), s('soon', 5 * H), s('past', -5 * H), s('gone', 2 * H, 'cancelled'), s('done', 1 * H, 'completed')], 0)
    expect(r.next?.id).toBe('soon')
    expect(r.upcoming).toBe(2)
  })
  it('still counts a session that is under way', () => {
    expect(nextSession([s('now', -10 * 60_000)], 0).next?.id).toBe('now')
  })
  it('is nothing when none are booked', () => {
    expect(nextSession([s('past', -5 * H), s('gone', 2 * H, 'cancelled')], 0)).toEqual({ next: null, upcoming: 0 })
    expect(nextSession([], 0)).toEqual({ next: null, upcoming: 0 })
  })
})
