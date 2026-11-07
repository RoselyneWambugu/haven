import { describe, expect, it } from 'vitest'
import { IF_NOT_GOOD, STANDING_TIERS } from '../src/data/standing'

describe('what the standing page tells a member', () => {
  it('names every state an account can be in, in order', () => {
    expect(STANDING_TIERS.map((t) => t.key)).toEqual(['good', 'warning', 'restricted', 'paused'])
  })
  it('says what to do, including appeals and the things that always stay available', () => {
    const all = IF_NOT_GOOD.join(' ')
    expect(all).toMatch(/Appeal/)
    expect(all).toMatch(/different reviewer/)
    expect(all).toMatch(/urgent help/)
    expect(all).toMatch(/help ticket/)
  })
})
