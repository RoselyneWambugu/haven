import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteEvents, syncEvents, syncPortalEvents, syncStaffEvents } from '../src/backend/remoteEvents'
import type { CommunityEvent } from '../src/api/types'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const ev = (over: Partial<CommunityEvent> = {}): CommunityEvent => ({
  id: 'e1', title: 'A slow evening walk', blurb: 'An easy group walk with a therapist alongside.', kind: 'walk', mode: 'in-person', place: 'Karura Forest, main gate',
  startsAt: Date.now() + 86_400_000, durationMin: 90, host: 'Echo', interested: 3, interestedByMe: false, ...over,
})

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name in replies) return { data: replies[name], error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

beforeEach(() => {
  resetClock()
  update(freshState())
})
afterEach(() => setClient(null))

describe('events from the server', () => {
  it('replace the demo starter events with what the server holds', async () => {
    expect(getDb().events.length).toBeGreaterThan(0)
    fake({ event_list: { ok: true, events: [ev()] } })
    await syncEvents()
    expect(getDb().events.map((e) => e.id)).toEqual(['e1'])
  })

  it('show nothing at all without a plan, so no demo events appear against the real service', async () => {
    fake({ event_list: { ok: false, code: 'needs-plan', error: 'Events need an active plan.' } })
    await syncEvents()
    expect(getDb().events).toEqual([])
  })

  it('give staff the full list', async () => {
    fake({ admin_events: { ok: true, events: [ev({ createdBy: 'Dr. K. Mwende' })] } })
    await syncStaffEvents()
    expect(getDb().events[0].createdBy).toBe('Dr. K. Mwende')
  })
})

describe('events the app asks for', () => {
  it('marks interest, then takes the server’s answer', async () => {
    update({ events: [ev()], subscription: { plan: 'monthly', status: 'active', renewsAt: Date.now() + 1e10 } as never, account: { id: 'u1' } as never })
    const calls = fake({ event_list: { ok: true, events: [ev({ interested: 4, interestedByMe: true })] } })
    const r = await remoteEvents.toggleInterest('e1')
    expect(r.ok).toBe(true)
    expect(calls[0]).toEqual({ name: 'event_toggle_interest', args: { p_id: 'e1' } })
    expect(getDb().events[0]).toMatchObject({ interested: 4, interestedByMe: true })
  })

  it('schedules with an ISO time and refreshes the staff list', async () => {
    const calls = fake({ admin_schedule_event: { ok: true, id: 'new-1' }, admin_events: { ok: true, events: [ev({ id: 'new-1' })] } })
    const startsAt = Date.UTC(2026, 10, 12, 15)
    const r = await remoteEvents.schedule({ title: 'A slow evening walk', blurb: 'An easy group walk with a therapist alongside.', kind: 'walk', mode: 'in-person', place: 'Karura Forest, main gate', startsAt, durationMin: 90, host: 'Echo' })
    expect(r).toEqual({ ok: true, value: { id: 'new-1' } })
    expect(calls[0].args).toMatchObject({ p_kind: 'walk', p_mode: 'in-person', p_starts: '2026-11-12T15:00:00.000Z', p_duration: 90, p_host: 'Echo' })
    expect(calls[1].name).toBe('admin_events')
  })

  it('shows the server’s reason when it refuses a cancel', async () => {
    fake({ admin_cancel_event: { ok: false, code: 'reason', error: 'A reason is required.' } })
    expect(await remoteEvents.cancel('e1', 'no')).toMatchObject({ ok: false, code: 'reason', error: 'A reason is required.' })
  })
})

describe('event proposals on the server', () => {
  it('sends a proposal with an ISO time and no host, then reads the therapist’s own list', async () => {
    const calls = fake({ portal_propose_event: { ok: true, id: 'p1' }, portal_events: { ok: true, events: [ev({ id: 'p1', status: 'pending', proposedBy: 'Dr. Amina Otieno' })] } })
    const startsAt = Date.UTC(2026, 10, 20, 15)
    const r = await remoteEvents.propose({ title: 'A slow evening walk', blurb: 'An easy group walk with a therapist alongside.', kind: 'walk', mode: 'in-person', place: 'Karura Forest, main gate', startsAt, durationMin: 90 })
    expect(r).toEqual({ ok: true, value: { id: 'p1' } })
    expect(calls[0].name).toBe('portal_propose_event')
    expect(calls[0].args).toMatchObject({ p_kind: 'walk', p_starts: '2026-11-20T15:00:00.000Z', p_duration: 90 })
    expect(calls[0].args).not.toHaveProperty('p_host')
    expect(getDb().events[0]).toMatchObject({ id: 'p1', status: 'pending' })
  })

  it('shows the server’s reason when a proposal is refused', async () => {
    fake({ portal_propose_event: { ok: false, code: 'too-many', error: 'You already have three proposals waiting.' } })
    const r = await remoteEvents.propose({ title: 'A slow evening walk', blurb: 'An easy group walk with a therapist alongside.', kind: 'walk', mode: 'online', place: 'Link sent the day before', startsAt: Date.now() + 9 * 86_400_000, durationMin: 60 })
    expect(r).toMatchObject({ ok: false, code: 'too-many' })
  })

  it('withdraws, approves and declines through the server', async () => {
    const calls = fake()
    await remoteEvents.withdraw('p1')
    await remoteEvents.decide('p1', true)
    await remoteEvents.decide('p2', false, 'We already have a walk that week')
    expect(calls.filter((c) => c.name !== 'portal_events' && c.name !== 'admin_events').map((c) => [c.name, c.args])).toEqual([
      ['portal_withdraw_event', { p_id: 'p1' }],
      ['admin_decide_event', { p_id: 'p1', p_approve: true, p_reason: null }],
      ['admin_decide_event', { p_id: 'p2', p_approve: false, p_reason: 'We already have a walk that week' }],
    ])
  })

  it('reads the therapist’s list', async () => {
    fake({ portal_events: { ok: true, events: [ev({ status: 'declined', declineReason: 'Not this month' })] } })
    await syncPortalEvents()
    expect(getDb().events[0].declineReason).toBe('Not this month')
  })
})
