import { describe, expect, it } from 'vitest'
import { THERAPISTS } from '../src/data/seed'
import { activeFilterCount, filterTherapists, NO_FILTERS, slotsFor } from '../src/lib/directory'
import { fromEat } from '../src/lib/time'

const NOW = fromEat(2026, 9, 19, 8, 0) // Monday 19 Oct 2026

describe('therapist directory', () => {
  it('lists everyone with no filters, soonest first, and never by payment', () => {
    const rows = filterTherapists(THERAPISTS, [], NO_FILTERS, NOW)
    expect(rows).toHaveLength(THERAPISTS.length)
    const firsts = rows.map((r) => r.slots[0]?.start ?? Infinity)
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts)
  })
  it('filters by topic, language, mode and gender together', () => {
    const f = { ...NO_FILTERS, specialisation: 'Grief', languages: ['Dholuo'], modes: ['chat' as const], gender: 'man' as const }
    expect(filterTherapists(THERAPISTS, [], f, NOW).map((r) => r.therapist.id)).toEqual(['t-peter'])
    expect(activeFilterCount(f)).toBe(4)
  })
  it('searches names and topics', () => {
    expect(filterTherapists(THERAPISTS, [], { ...NO_FILTERS, query: 'psychiatrist' }, NOW).map((r) => r.therapist.id)).toEqual(['t-grace'])
    expect(filterTherapists(THERAPISTS, [], { ...NO_FILTERS, query: 'somali' }, NOW).map((r) => r.therapist.id)).toEqual(['t-hassan'])
    expect(filterTherapists(THERAPISTS, [], { ...NO_FILTERS, query: 'zzz' }, NOW)).toEqual([])
  })
  it('can ask for a price ceiling', () => {
    const rows = filterTherapists(THERAPISTS, [], { ...NO_FILTERS, maxPriceKes: 1200 }, NOW)
    rows.forEach((r) => expect(r.therapist.priceKes!).toBeLessThanOrEqual(1200))
    expect(rows.length).toBeGreaterThan(0)
  })
  it('sorts by rating and by language match', () => {
    const byRating = filterTherapists(THERAPISTS, [], NO_FILTERS, NOW, 'rating').map((r) => r.therapist.rating)
    expect([...byRating].sort((a, b) => b - a)).toEqual(byRating)
    const byLang = filterTherapists(THERAPISTS, [], NO_FILTERS, NOW, 'language', ['Somali', 'Kiswahili'])
    expect(byLang[0].therapist.id).toBe('t-hassan')
  })
  it('leaves out slots I have already booked', () => {
    const amina = THERAPISTS[0]
    const slots = slotsFor(amina, [], NOW)
    expect(slots.length).toBeGreaterThan(0)
    const first = slots[0]
    const booked = [{ therapistId: amina.id, status: 'booked', start: first.start }] as never
    expect(slotsFor(amina, booked, NOW).map((s) => s.start)).not.toContain(first.start)
  })
  it('only shows therapists with a slot today when asked', () => {
    const rows = filterTherapists(THERAPISTS, [], { ...NO_FILTERS, when: 'today' }, NOW)
    rows.forEach((r) => expect(r.slots.some((s) => s.start < fromEat(2026, 9, 20))).toBe(true))
  })
})
