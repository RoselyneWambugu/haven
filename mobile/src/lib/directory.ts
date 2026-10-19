import type { Therapist, Session } from '@/api/types'
import { generateSlots, type Mode, type Slot } from './booking'
import { isSameEatDay, startOfEatDay } from './time'

export interface DirectoryFilters {
  query: string
  specialisation: string | null
  languages: string[]
  modes: Mode[]
  when: 'any' | 'today' | 'week'
  gender: 'any' | 'woman' | 'man'
  maxPriceKes: number | null
}

export const NO_FILTERS: DirectoryFilters = { query: '', specialisation: null, languages: [], modes: [], when: 'any', gender: 'any', maxPriceKes: null }

export type DirectorySort = 'next' | 'rating' | 'price' | 'language'

export function activeFilterCount(f: DirectoryFilters): number {
  return (
    (f.specialisation ? 1 : 0) + (f.languages.length ? 1 : 0) + (f.modes.length ? 1 : 0) +
    (f.when !== 'any' ? 1 : 0) + (f.gender !== 'any' ? 1 : 0) + (f.maxPriceKes !== null ? 1 : 0)
  )
}

/** A stable stand-in for "other clients booked this one". The real backend knows. */
function takenByOthers(id: string): boolean {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 5 === 0
}

export function slotsFor(t: Therapist, sessions: Session[], now: number, days = 14): Slot[] {
  const mine = sessions.filter((s) => s.therapistId === t.id && s.status === 'booked').map((s) => s.start)
  return generateSlots(t.availability, now, days, mine, t.id).filter((s) => !takenByOthers(s.id))
}

export interface DirectoryRow {
  therapist: Therapist
  slots: Slot[]
}

export function filterTherapists(
  therapists: Therapist[],
  sessions: Session[],
  filters: DirectoryFilters,
  now: number,
  sort: DirectorySort = 'next',
  memberLanguages: string[] = [],
): DirectoryRow[] {
  const q = filters.query.trim().toLowerCase()
  let rows = therapists.map((t) => ({ therapist: t, slots: slotsFor(t, sessions, now) }))
  rows = rows.filter(({ therapist: t, slots }) => {
    if (q && !`${t.name} ${t.title} ${t.specialisations.join(' ')} ${t.languages.join(' ')}`.toLowerCase().includes(q)) return false
    if (filters.specialisation && !t.specialisations.includes(filters.specialisation)) return false
    if (filters.languages.length && !filters.languages.some((l) => t.languages.includes(l))) return false
    if (filters.modes.length && !filters.modes.every((m) => t.modes.includes(m))) return false
    if (filters.gender !== 'any' && t.gender !== filters.gender) return false
    if (filters.maxPriceKes !== null && (t.priceKes ?? 0) > filters.maxPriceKes) return false
    if (filters.when === 'today' && !slots.some((s) => isSameEatDay(s.start, now))) return false
    if (filters.when === 'week' && !slots.some((s) => s.start < startOfEatDay(now) + 7 * 24 * 3600_000)) return false
    return true
  })
  const firstSlot = (r: DirectoryRow) => r.slots[0]?.start ?? Number.MAX_SAFE_INTEGER
  const langScore = (r: DirectoryRow) => r.therapist.languages.filter((l) => memberLanguages.includes(l)).length
  rows.sort((a, b) => {
    if (sort === 'rating') return b.therapist.rating - a.therapist.rating || firstSlot(a) - firstSlot(b)
    if (sort === 'price') return (a.therapist.priceKes ?? 0) - (b.therapist.priceKes ?? 0) || firstSlot(a) - firstSlot(b)
    if (sort === 'language') return langScore(b) - langScore(a) || firstSlot(a) - firstSlot(b)
    return firstSlot(a) - firstSlot(b) // next available; no paid placement (D38)
  })
  return rows
}
