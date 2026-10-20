import { describe, expect, it } from 'vitest'
import { liveStars, MIN_REVIEWS, ratingLabel, summarise } from '../src/lib/ratings'
import { filterTherapists, NO_FILTERS } from '../src/lib/directory'
import { THERAPISTS } from '../src/data/seed'

describe('therapist ratings (FDB-2)', () => {
  it('shows nothing until enough people have rated', () => {
    expect(summarise({ rating: 0, reviews: 0 })).toEqual({ count: 0, average: null })
    expect(summarise({ rating: 5, reviews: MIN_REVIEWS - 1 }).average).toBeNull()
    expect(summarise({ rating: 4.8, reviews: MIN_REVIEWS }).average).toBe(4.8)
  })
  it('counts new ratings from this device towards the total', () => {
    expect(summarise({ rating: 4.0, reviews: 9 }, [5]).average).toBe(4.1)
    expect(summarise({ rating: 4.8, reviews: 126 }, [1]).count).toBe(127)
  })
  it('finds only the stars given to that therapist', () => {
    const s = [{ therapistId: 'a', rating: { stars: 4, comment: '' } }, { therapistId: 'b', rating: { stars: 1, comment: '' } }, { therapistId: 'a', rating: null }]
    expect(liveStars(s, 'a')).toEqual([4])
  })
  it('words it plainly', () => {
    expect(ratingLabel({ count: 126, average: 4.8 })).toBe('4.8 (126)')
    expect(ratingLabel({ count: 0, average: null })).toBe('New to Echo')
    expect(ratingLabel({ count: 1, average: null })).toBe('1 review so far')
    expect(ratingLabel({ count: 4, average: null })).toBe('4 reviews so far')
  })
  it('sorts rated therapists before those with too few reviews', () => {
    const a = { ...THERAPISTS[0], id: 'new', reviews: 2, rating: 5 }
    const rows = filterTherapists([a, THERAPISTS[3]], [], NO_FILTERS, Date.now(), 'rating')
    expect(rows[0].therapist.id).toBe(THERAPISTS[3].id)
  })
})
