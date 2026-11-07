import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { ledUpcoming, MAX_LED_UPCOMING, status } from '../src/lib/groupChat'
import { freshState, getDb, update } from '../src/store/db'

const H = 3600_000
const room = (over: Record<string, unknown> = {}) => ({ topic: 'Evenings that feel heavy', blurb: 'A calm hour to talk about long evenings.', startsAt: now() + 5 * H, durationMin: 60, capacity: 10, ...over })

describe('therapists schedule their own group chats', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    api.portal.signIn()
  })
  it('schedules a room the therapist leads, with their name on it', () => {
    const before = getDb().groupChats.length
    const r = api.groups.leadSchedule(room())
    expect(r.ok).toBe(true)
    expect(getDb().groupChats.length).toBe(before + 1)
    const g = getDb().groupChats.find((x) => x.topic === 'Evenings that feel heavy')!
    expect(g.facilitatorId).toBe(getDb().portal!.therapistId)
    expect(g.createdBy).toBeTruthy()
    expect(status(g, now())).toBe('upcoming')
  })

  it('applies the same rules as staff', () => {
    expect(api.groups.leadSchedule(room({ topic: 'Group treatment circle' }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.groups.leadSchedule(room({ blurb: 'too short' }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.groups.leadSchedule(room({ startsAt: now() + 10 * 60_000 }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.groups.leadSchedule(room({ durationMin: 120 }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.groups.leadSchedule(room({ capacity: 40 }))).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('refuses two rooms at the same time', () => {
    expect(api.groups.leadSchedule(room()).ok).toBe(true)
    expect(api.groups.leadSchedule(room({ topic: 'A second room, same hour', startsAt: now() + 5 * H + 30 * 60_000 }))).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('caps how many upcoming rooms one therapist leads', () => {
    const id = getDb().portal!.therapistId
    let guard = 0
    while (ledUpcoming(getDb().groupChats, id, now()) < MAX_LED_UPCOMING && guard++ < 5) {
      expect(api.groups.leadSchedule(room({ topic: `Quiet hour number ${guard + 1}`, startsAt: now() + (30 + guard * 5) * H })).ok).toBe(true)
    }
    expect(api.groups.leadSchedule(room({ topic: 'One room too many', startsAt: now() + 200 * H }))).toMatchObject({ ok: false, code: 'limit' })
  })

  it('is refused for a therapist whose new clients are paused', () => {
    update((s) => ({ portal: { ...s.portal!, paused: true } }))
    expect(api.groups.leadSchedule(room())).toMatchObject({ ok: false, code: 'paused' })
  })

  it('edits a room before it opens and keeps people signed up', () => {
    const id = (api.groups.leadSchedule(room()) as { ok: true; value: { id: string } }).value.id
    expect(api.groups.leadEdit(id, room({ topic: 'Evenings that feel lighter', capacity: 6 })).ok).toBe(true)
    expect(getDb().groupChats.find((g) => g.id === id)!.topic).toBe('Evenings that feel lighter')
    update((s) => ({ groupChats: s.groupChats.map((g) => (g.id === id ? { ...g, takenOthers: 8 } : g)) }))
    expect(api.groups.leadEdit(id, room({ capacity: 6 }))).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('cancels with a reason, and not once it has started', () => {
    const id = (api.groups.leadSchedule(room()) as { ok: true; value: { id: string } }).value.id
    expect(api.groups.leadCancel(id, 'no')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.groups.leadCancel(id, 'I am unwell that day').ok).toBe(true)
    expect(getDb().groupChats.find((g) => g.id === id)!.cancelled?.by).toBeTruthy()
    expect(api.groups.leadCancel(id, 'I am unwell that day')).toMatchObject({ ok: false, code: 'cancelled' })
    const id2 = (api.groups.leadSchedule(room({ topic: 'Another hour for later', startsAt: now() + 2 * H })) as { ok: true; value: { id: string } }).value.id
    advanceClock(2 * H + 5 * 60_000)
    expect(api.groups.leadCancel(id2, 'Changed my mind')).toMatchObject({ ok: false, code: 'started' })
  })

  it('does not let a therapist change a room somebody else leads', () => {
    update((st) => ({ groupChats: [...st.groupChats, { id: 'gc-x', topic: 'Somebody else leads this', blurb: 'A room that belongs to another therapist.', facilitatorId: 't-faith', startsAt: now() + 9 * H, durationMin: 60, capacity: 10, takenOthers: 0, registered: false, messages: [], posted: 0 }] }))
    const other = getDb().groupChats.find((g) => g.facilitatorId !== getDb().portal!.therapistId)!
    expect(api.groups.leadEdit(other.id, room())).toMatchObject({ ok: false, code: 'gone' })
    expect(api.groups.leadCancel(other.id, 'Not mine to cancel')).toMatchObject({ ok: false, code: 'gone' })
  })
})
