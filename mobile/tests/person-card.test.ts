import { describe, expect, it } from 'vitest'
import { api } from '../src/api'
import { demoSince, sinceLabel } from '../src/lib/personCard'
import { freshState, getDb, update } from '../src/store/db'

const NOW = Date.UTC(2026, 10, 7)

describe('the light card for a pen name', () => {
  it('says how long someone has been here, to the month only', () => {
    expect(sinceLabel(Date.UTC(2026, 9, 1), NOW)).toBe('Here since October 2026')
    expect(sinceLabel(Date.UTC(2026, 10, 1), NOW)).toBe('Here since this month')
    expect(sinceLabel(Date.UTC(2025, 2, 1), NOW)).toBe('Here since March 2025')
  })
  it('makes the same demo date each time, on the first of a month in the past', () => {
    const a = demoSince('peer-RiverStone', NOW)
    expect(demoSince('peer-RiverStone', NOW)).toBe(a)
    expect(new Date(a).getUTCDate()).toBe(1)
    expect(a).toBeLessThan(NOW)
  })
  it('returns nothing but the date', async () => {
    const c = await api.forum.memberCard('peer-RiverStone')
    expect(Object.keys(c ?? {})).toEqual(['since'])
  })
  it('mutes and unmutes a pen name', () => {
    update(freshState())
    api.forum.muteAuthor('peer-RiverStone')
    expect(getDb().mutedAuthors).toContain('peer-RiverStone')
    api.forum.unmuteAuthor('peer-RiverStone')
    expect(getDb().mutedAuthors).not.toContain('peer-RiverStone')
  })
})
