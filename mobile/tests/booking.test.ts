import { describe, expect, it } from 'vitest'
import { canJoin, changeOutcome, freeChangeDeadline, generateSlots, groupSlotsByDay, HOUR, joinOpensAt, MIN, nextAvailableLabel, type AvailabilityBlock } from '../src/lib/booking'
import { clock, dayAndClock, dayLong, eat, fromEat, isSameEatDay, relative, startOfEatDay } from '../src/lib/time'
import { kes } from '../src/lib/money'

// Monday 19 Oct 2026, 08:00 Kenya time.
const NOW = fromEat(2026, 9, 19, 8, 0)

describe('Kenya time', () => {
  it('round-trips and formats', () => {
    const t = fromEat(2026, 9, 21, 10, 30)
    expect(eat(t)).toMatchObject({ year: 2026, month: 9, day: 21, hour: 10, minute: 30, dow: 3 })
    expect(clock(t)).toBe('10:30')
    expect(dayAndClock(t)).toBe('Wed 21 Oct, 10:30')
    expect(dayLong(t)).toBe('Wednesday 21 Oct')
  })
  it('treats the day boundary in Kenya, not UTC', () => {
    const lateNight = fromEat(2026, 9, 20, 23, 30) // 20:30 UTC
    const nextMorning = fromEat(2026, 9, 21, 0, 15) // 21:15 UTC same UTC day
    expect(isSameEatDay(lateNight, nextMorning)).toBe(false)
    expect(startOfEatDay(lateNight)).toBe(fromEat(2026, 9, 20))
  })
  it('says how long ago', () => {
    expect(relative(NOW - 30_000, NOW)).toBe('now')
    expect(relative(NOW - 5 * MIN, NOW)).toBe('5 min')
    expect(relative(NOW - 3 * HOUR, NOW)).toBe('3 h')
    expect(relative(NOW - 2 * 24 * HOUR, NOW)).toBe('2 d')
  })
})

describe('change and join rules', () => {
  const start = fromEat(2026, 9, 21, 10, 30)
  it('is free to change until 24 hours before', () => {
    expect(freeChangeDeadline(start)).toBe(fromEat(2026, 9, 20, 10, 30))
    expect(changeOutcome(start, fromEat(2026, 9, 20, 10, 29))).toBe('free')
    expect(changeOutcome(start, fromEat(2026, 9, 20, 10, 30))).toBe('free')
    expect(changeOutcome(start, fromEat(2026, 9, 20, 10, 31))).toBe('late')
  })
  it('opens the join window 10 minutes before and closes at the end', () => {
    const end = start + 45 * MIN
    expect(joinOpensAt(start)).toBe(start - 10 * MIN)
    expect(canJoin(start, end, start - 11 * MIN)).toBe(false)
    expect(canJoin(start, end, start - 10 * MIN)).toBe(true)
    expect(canJoin(start, end, end - 1)).toBe(true)
    expect(canJoin(start, end, end)).toBe(false)
  })
})

describe('slot generation', () => {
  const avail: AvailabilityBlock[] = [
    { dow: 1, start: '09:00', end: '12:00', modes: ['chat', 'voice'] }, // Mondays
    { dow: 2, start: '14:00', end: '16:00', modes: ['video'] }, // Tuesdays
  ]
  it('makes whole-hour slots that fit the session length', () => {
    const slots = generateSlots(avail, fromEat(2026, 9, 18, 8, 0), 3, [], 'x') // Sun to Tue
    const labels = slots.map((s) => dayAndClock(s.start))
    expect(labels).toEqual(['Mon 19 Oct, 09:00', 'Mon 19 Oct, 10:00', 'Mon 19 Oct, 11:00', 'Tue 20 Oct, 14:00', 'Tue 20 Oct, 15:00'])
    expect(slots[0].modes).toEqual(['chat', 'voice'])
    expect(slots[0].end - slots[0].start).toBe(45 * MIN)
  })
  it('hides slots that are too soon, past, or already booked', () => {
    const slots = generateSlots(avail, NOW, 2, [fromEat(2026, 9, 19, 11, 0)], 'x')
    // 08:00 now, 2 hour lead time: 09:00 is too soon, 10:00 is exactly 2 hours away so it is bookable, 11:00 is booked.
    expect(slots.map((s) => dayAndClock(s.start))).toEqual(['Mon 19 Oct, 10:00', 'Tue 20 Oct, 14:00', 'Tue 20 Oct, 15:00'])
  })
  it('groups by day and labels the next one', () => {
    const slots = generateSlots(avail, fromEat(2026, 9, 18, 8, 0), 3, [], 'x')
    expect(groupSlotsByDay(slots)).toHaveLength(2)
    expect(nextAvailableLabel(slots, fromEat(2026, 9, 19, 8, 0))).toBe('Next: today 09:00')
    expect(nextAvailableLabel(slots, fromEat(2026, 9, 18, 8, 0))).toBe('Next: tomorrow 09:00')
    expect(nextAvailableLabel([], NOW)).toBeNull()
  })
})

describe('money', () => {
  it('shows a placeholder for undecided prices', () => {
    expect(kes(null)).toBe('KES ___')
    expect(kes(1500)).toBe('KES 1,500')
    expect(kes(0)).toBe('KES 0')
  })
})

import { availability, filterTherapists as ft, NO_FILTERS as NF, slotsFor as sf, soonSlot } from '../src/lib/directory'
import { fromEat as fe } from '../src/lib/time'
import { THERAPISTS as TH } from '../src/data/seed'

describe('available now or within the hour', () => {
  // Dr. Amina Otieno is on Mondays 09:00 to 12:00.
  const amina = { ...TH[0], acceptingNew: true, suspended: false }
  const mon = (h: number, m = 0) => fe(2026, 9, 19, h, m) // Monday 19 Oct 2026, East Africa Time
  it('is on now inside a block with a session left, rounded up to the quarter hour', () => {
    const slot = soonSlot(amina, [], mon(10, 3))
    expect(slot).toMatchObject({ soon: true })
    expect(slot!.start).toBe(mon(10, 15))
    expect(availability(amina, [], mon(10, 3)).state).toBe('now')
  })
  it('starts within the hour when the block opens soon', () => {
    const a = availability(amina, [], mon(8, 20))
    expect(a.state).toBe('hour')
    expect(a.slot!.start).toBe(mon(9, 0))
  })
  it('is not available when too little of the block is left, too early, or on another day', () => {
    expect(soonSlot(amina, [], mon(11, 30))).toBeNull()
    expect(soonSlot(amina, [], mon(7, 0))).toBeNull()
    expect(soonSlot(amina, [], mon(10, 0) + 24 * 3600_000 * 2)).toBeNull()
  })
  it('is not offered by a therapist who is paused, suspended, or already booked then', () => {
    expect(soonSlot({ ...amina, acceptingNew: false }, [], mon(10, 3))).toBeNull()
    expect(soonSlot({ ...amina, suspended: true }, [], mon(10, 3))).toBeNull()
    expect(soonSlot(amina, [{ therapistId: amina.id, status: 'booked', start: mon(10, 15) }], mon(10, 3))).toBeNull()
  })
  it('puts the immediate slot first in the booking times and filters the directory', () => {
    const slots = sf(amina as never, [], mon(10, 3))
    expect(slots[0].soon).toBe(true)
    const rows = ft([amina as never], [], { ...NF, when: 'now' }, mon(10, 3))
    expect(rows).toHaveLength(1)
    expect(ft([amina as never], [], { ...NF, when: 'now' }, mon(7, 0))).toHaveLength(0)
    expect(ft([amina as never], [], { ...NF, when: 'hour' }, mon(8, 30))).toHaveLength(1)
  })
})
