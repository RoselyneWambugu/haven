import { clock, eat, fromEat, isSameEatDay, startOfEatDay } from './time'

/** Booking and change rules (PRD THR-26 to THR-31). Windows are placeholders until D39 and D40 are decided. */
export const FREE_CHANGE_HOURS = 24
export const JOIN_OPENS_MINUTES = 10
export const SESSION_MINUTES = 45
export const BOOKING_LEAD_HOURS = 2
export const HOUR = 3600_000
export const MIN = 60_000

export type Mode = 'chat' | 'voice' | 'video'

/** A weekly block when a therapist is open. dow: 0 = Sunday. Times are Kenya time. */
export interface AvailabilityBlock {
  dow: number
  start: string // "HH:MM"
  end: string
  modes: Mode[]
}

export interface Slot {
  id: string
  start: number
  end: number
  modes: Mode[]
  /** An immediate slot: the therapist is on now, or starts within the hour. It skips the usual booking lead time. */
  soon?: boolean
}

export function freeChangeDeadline(start: number): number {
  return start - FREE_CHANGE_HOURS * HOUR
}

export function changeOutcome(start: number, now: number): 'free' | 'late' {
  return now <= freeChangeDeadline(start) ? 'free' : 'late'
}

export function joinOpensAt(start: number): number {
  return start - JOIN_OPENS_MINUTES * MIN
}

/** Joining is possible from 10 minutes before the start until the session ends. */
export function canJoin(start: number, end: number, now: number): boolean {
  return now >= joinOpensAt(start) && now < end
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Whole-hour slots inside each availability block for the next `days` days,
 * leaving out anything too soon, in the past or already booked.
 */
export function generateSlots(
  availability: AvailabilityBlock[],
  now: number,
  days: number,
  booked: number[] = [],
  therapistId = 't',
): Slot[] {
  const slots: Slot[] = []
  const today = startOfEatDay(now)
  const earliest = now + BOOKING_LEAD_HOURS * HOUR
  for (let i = 0; i < days; i++) {
    const dayStart = today + i * 24 * HOUR
    const p = eat(dayStart)
    for (const block of availability.filter((b) => b.dow === p.dow)) {
      const startMin = minutesOf(block.start)
      const endMin = minutesOf(block.end)
      for (let t = startMin; t + SESSION_MINUTES <= endMin; t += 60) {
        const start = fromEat(p.year, p.month, p.day, Math.floor(t / 60), t % 60)
        if (start < earliest) continue
        if (booked.some((b) => Math.abs(b - start) < SESSION_MINUTES * MIN)) continue
        slots.push({ id: `${therapistId}-${start}`, start, end: start + SESSION_MINUTES * MIN, modes: block.modes })
      }
    }
  }
  return slots
}

export function nextAvailableLabel(slots: Slot[], now: number): string | null {
  const s = slots[0]
  if (!s) return null
  if (s.soon) return s.start - now <= 15 * MIN ? 'Available now' : `Available in ${Math.max(1, Math.round((s.start - now) / MIN))} min`
  if (isSameEatDay(s.start, now)) return `Next: today ${clock(s.start)}`
  if (isSameEatDay(s.start, now + 24 * HOUR)) return `Next: tomorrow ${clock(s.start)}`
  return `Next: ${clock(s.start)} on ${eat(s.start).day}/${eat(s.start).month + 1}`
}

export function groupSlotsByDay(slots: Slot[]): { day: number; slots: Slot[] }[] {
  const map = new Map<number, Slot[]>()
  for (const s of slots) {
    const d = startOfEatDay(s.start)
    map.set(d, [...(map.get(d) ?? []), s])
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([day, list]) => ({ day, slots: list }))
}
