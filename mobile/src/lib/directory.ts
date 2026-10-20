import { liveStars, summarise } from './ratings'
import type { Therapist, Session } from '@/api/types'
import { generateSlots, SESSION_MINUTES, type Mode, type Slot } from './booking'
import { eat, fromEat, isSameEatDay, startOfEatDay } from './time'

export interface DirectoryFilters {
  query: string
  specialisation: string | null
  languages: string[]
  modes: Mode[]
  when: 'any' | 'now' | 'hour' | 'today' | 'week'
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

const MIN_MS = 60_000
/** "On now" means a session could start within this long. */
export const NOW_WITHIN_MIN = 15
export const HOUR_WITHIN_MIN = 60

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * The soonest session a therapist could give from right now, if they are on now or start within the hour: inside a
 * block of their weekly availability with a full session left, rounded up to the next quarter hour. Null otherwise.
 */
export function soonSlot(t: Therapist, sessions: Pick<Session, 'therapistId' | 'status' | 'start'>[], now: number): Slot | null {
  if (!t.acceptingNew || t.suspended) return null
  const p = eat(now)
  const mine = sessions.filter((s) => s.therapistId === t.id && s.status === 'booked').map((s) => s.start)
  for (const block of t.availability.filter((b) => b.dow === p.dow)) {
    const blockStart = fromEat(p.year, p.month, p.day, 0, toMinutes(block.start))
    const blockEnd = fromEat(p.year, p.month, p.day, 0, toMinutes(block.end))
    const quarter = 15 * MIN_MS
    const start = Math.max(Math.ceil(now / quarter) * quarter, blockStart)
    if (start - now > HOUR_WITHIN_MIN * MIN_MS) continue
    if (start + SESSION_MINUTES * MIN_MS > blockEnd) continue
    if (mine.some((b) => Math.abs(b - start) < SESSION_MINUTES * MIN_MS)) continue
    const id = `${t.id}-${start}`
    if (takenByOthers(id)) continue
    return { id, start, end: start + SESSION_MINUTES * MIN_MS, modes: block.modes, soon: true }
  }
  return null
}

/** "now", "hour" (starts within the hour) or "later". */
export function availability(t: Therapist, sessions: Pick<Session, 'therapistId' | 'status' | 'start'>[], now: number): { state: 'now' | 'hour' | 'later'; slot: Slot | null } {
  const slot = soonSlot(t, sessions, now)
  if (!slot) return { state: 'later', slot: null }
  return { state: slot.start - now <= NOW_WITHIN_MIN * MIN_MS ? 'now' : 'hour', slot }
}

export function slotsFor(t: Therapist, sessions: Session[], now: number, days = 14): Slot[] {
  const mine = sessions.filter((s) => s.therapistId === t.id && s.status === 'booked').map((s) => s.start)
  const regular = generateSlots(t.availability, now, days, mine, t.id).filter((s) => !takenByOthers(s.id))
  const soon = soonSlot(t, sessions, now)
  return soon && !regular.some((s) => s.id === soon.id) ? [soon, ...regular] : regular
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
  let rows = therapists.filter((t) => !t.suspended).map((t) => ({ therapist: t, slots: slotsFor(t, sessions, now) }))
  rows = rows.filter(({ therapist: t, slots }) => {
    if (q && !`${t.name} ${t.title} ${t.specialisations.join(' ')} ${t.languages.join(' ')}`.toLowerCase().includes(q)) return false
    if (filters.specialisation && !t.specialisations.includes(filters.specialisation)) return false
    if (filters.languages.length && !filters.languages.some((l) => t.languages.includes(l))) return false
    if (filters.modes.length && !filters.modes.every((m) => t.modes.includes(m))) return false
    if (filters.gender !== 'any' && t.gender !== filters.gender) return false
    if (filters.maxPriceKes !== null && (t.priceKes ?? 0) > filters.maxPriceKes) return false
    if (filters.when === 'now' && availability(t, sessions, now).state !== 'now') return false
    if (filters.when === 'hour' && availability(t, sessions, now).state === 'later') return false
    if (filters.when === 'today' && !slots.some((s) => isSameEatDay(s.start, now))) return false
    if (filters.when === 'week' && !slots.some((s) => s.start < startOfEatDay(now) + 7 * 24 * 3600_000)) return false
    return true
  })
  const firstSlot = (r: DirectoryRow) => r.slots[0]?.start ?? Number.MAX_SAFE_INTEGER
  // Therapists with too few reviews have no rating yet, so they follow the rated ones.
  const stars = (r: DirectoryRow) => summarise(r.therapist, liveStars(sessions, r.therapist.id)).average ?? -1
  const langScore = (r: DirectoryRow) => r.therapist.languages.filter((l) => memberLanguages.includes(l)).length
  rows.sort((a, b) => {
    if (sort === 'rating') return stars(b) - stars(a) || firstSlot(a) - firstSlot(b)
    if (sort === 'price') return (a.therapist.priceKes ?? 0) - (b.therapist.priceKes ?? 0) || firstSlot(a) - firstSlot(b)
    if (sort === 'language') return langScore(b) - langScore(a) || firstSlot(a) - firstSlot(b)
    return firstSlot(a) - firstSlot(b) // next available; no paid placement (D38)
  })
  return rows
}
