import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteBilling, wait } from '../src/backend/remoteBilling'
import { remoteReport, stopPolling } from '../src/backend/remoteChat'
import { remoteSessions, syncDirectory, syncSessions } from '../src/backend/remoteTherapists'
import { THERAPISTS } from '../src/data/seed'
import { slotsFor, soonSlot } from '../src/lib/directory'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock, now } from '../src/lib/clock'
import { DEFAULT_SETTINGS } from '../src/api/auth'
import type { Account } from '../src/api/types'

const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()
const REMOTE_T = {
  id: 't-x', name: 'Dr. Test', title: 'Counsellor', tone: 'a', gender: 'woman', bio: 'Hello.', specialisations: ['Grief'], languages: ['English'], modes: ['chat', 'voice'], price_kes: 1500,
  licence_body: 'Board', licence_number: '1', licence_valid_to: Date.UTC(2027, 0, 1), accepting_new: true, rating_sum: 45, rating_count: 10,
  availability: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: '00:00', end: '23:00', modes: ['chat', 'voice'] })), taken: [] as number[],
}
const SESSION = (over: Record<string, unknown> = {}) => ({
  id: 's-1', therapist_id: 't-x', mode: 'chat', start_at: iso(now() + 48 * HOUR), end_at: iso(now() + 48 * HOUR + 45 * 60_000), status: 'booked', price_kes: 1500, receipt_no: 'EC-111111',
  created_at: iso(now()), late_charge: false, follow_up_offer: null, rating: null, ...over,
})

interface Script { dir?: unknown; sessions?: unknown; replies?: Record<string, unknown> }

function fake(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (script.replies && name in script.replies) return { data: script.replies[name], error: null }
      if (name === 'therapist_directory') return { data: script.dir ?? { ok: true, therapists: [REMOTE_T] }, error: null }
      if (name === 'my_sessions') return { data: script.sessions ?? { ok: true, sessions: [] }, error: null }
      if (name === 'my_chats') return { data: { ok: true, conversations: [], blocked: [], match: null }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

const member = { id: 'u1', standing: 'good', settings: DEFAULT_SETTINGS, public: { penName: 'Me' }, blocked: [] } as unknown as Account
const original = THERAPISTS.slice()

beforeEach(() => {
  wait.ms = 0
  resetClock()
  update({ ...freshState(), account: member, signedIn: true } as never)
})
afterEach(() => {
  stopPolling()
  THERAPISTS.splice(0, THERAPISTS.length, ...original)
})

describe('the directory', () => {
  it('replaces the sample therapists with the server’s and redraws the screens', async () => {
    const v = getDb().directoryVersion
    fake()
    await syncDirectory()
    expect(THERAPISTS.map((t) => t.id)).toEqual(['t-x'])
    expect(THERAPISTS[0]).toMatchObject({ name: 'Dr. Test', priceKes: 1500, acceptingNew: true, licenceNumber: '1' })
    expect(getDb().directoryVersion).toBeGreaterThan(v)
  })

  it('leaves out the member’s own ratings from the base, because the screens add them back', async () => {
    update({ sessions: [{ id: 's', therapistId: 't-x', rating: { stars: 5, comment: '' } }] } as never)
    fake()
    await syncDirectory()
    expect(THERAPISTS[0].reviews).toBe(9)
    expect(THERAPISTS[0].rating).toBeCloseTo(40 / 9, 5)
  })

  it('uses the times the server says are taken, not made-up ones', async () => {
    const t = now() + 3 * HOUR
    const day = Math.floor(t / HOUR) * HOUR
    const free = await (async () => {
      fake()
      await syncDirectory()
      return slotsFor(THERAPISTS[0], [], now())
    })()
    expect(free.length).toBeGreaterThan(10)
    const target = free[3].start
    fake({ dir: { ok: true, therapists: [{ ...REMOTE_T, taken: [target] }] } })
    await syncDirectory()
    expect(slotsFor(THERAPISTS[0], [], now()).some((s) => s.start === target)).toBe(false)
    expect(slotsFor(THERAPISTS[0], [], now()).length).toBe(free.length - 1)
    expect(day).toBeGreaterThan(0)
  })

  it('offers a session that starts within the hour when the therapist is on now', async () => {
    fake()
    await syncDirectory()
    const soon = soonSlot(THERAPISTS[0], [], now())
    expect(soon?.soon).toBe(true)
  })

  it('keeps what it had when the server can’t be reached', async () => {
    fake()
    await syncDirectory()
    setClient({ rpc: async () => ({ data: null, error: { message: 'down' } }) } as unknown as SupabaseClient)
    await syncDirectory()
    expect(THERAPISTS.map((t) => t.id)).toEqual(['t-x'])
  })
})

describe('sessions', () => {
  it('shows the member’s sessions from the server', async () => {
    fake({ sessions: { ok: true, sessions: [SESSION({ rating: { stars: 4, comment: 'Good' }, follow_up_offer: iso(now() + 72 * HOUR) })] } })
    await syncSessions()
    const s = getDb().sessions[0]
    expect(s).toMatchObject({ id: 's-1', therapistId: 't-x', mode: 'chat', status: 'booked', priceKes: 1500, receiptNo: 'EC-111111', lateChargeApplied: false })
    expect(s.end - s.start).toBe(45 * 60_000)
    expect(s.rating).toEqual({ stars: 4, comment: 'Good' })
    expect(s.followUpOffer).not.toBeNull()
  })

  it('cancelling and moving a session return the server’s verdict on charges', async () => {
    const calls = fake({ replies: { cancel_session: { ok: true, outcome: 'late' }, reschedule_session: { ok: true, outcome: 'free' } } })
    expect(await remoteSessions.cancel('s-1')).toEqual({ ok: true, value: { outcome: 'late' } })
    const when = now() + 72 * HOUR
    expect(await remoteSessions.reschedule('s-1', when)).toEqual({ ok: true, value: { outcome: 'free' } })
    expect(calls.find((c) => c.name === 'reschedule_session')?.args).toEqual({ p_id: 's-1', p_start: iso(when) })
  })

  it('shows the server’s reason when a time can’t be taken or joined yet', async () => {
    fake({ replies: { reschedule_session: { ok: false, code: 'taken', error: 'That time isn’t available. Please pick another.' }, join_session: { ok: false, code: 'early', error: 'The session isn’t open yet.' } } })
    expect(await remoteSessions.reschedule('s-1', now() + 72 * HOUR)).toMatchObject({ ok: false, code: 'taken' })
    expect(await remoteSessions.join('s-1')).toMatchObject({ ok: false, code: 'early' })
  })

  it('ending a call records the session as finished, and rating tells the server', async () => {
    update({ sessions: [{ id: 's-1', therapistId: 't-x', status: 'booked', start: now() - HOUR, end: now() + HOUR, rating: null, followUpOffer: null }] } as never)
    const calls = fake()
    remoteSessions.end('s-1')
    expect(calls.some((c) => c.name === 'complete_session')).toBe(true)
    remoteSessions.rate('s-1', 5, 'Felt heard.')
    expect(calls.find((c) => c.name === 'rate_session')?.args).toEqual({ p_id: 's-1', p_stars: 5, p_comment: 'Felt heard.' })
  })
})

describe('booking and concerns', () => {
  it('opens a checkout for a session and keeps the server’s order and price', async () => {
    const start = now() + 30 * HOUR
    const calls = fake({ replies: { start_session_checkout: { ok: true, order_id: 'o-9', amount_kes: 1500, title: 'Session with Dr. Test' } } })
    const r = await remoteBilling.createCheckout({ kind: 'session', therapistId: 't-x', mode: 'chat', start })
    expect(r).toEqual({ ok: true, value: { title: 'Session with Dr. Test', amountKes: 1500 } })
    expect(calls.find((c) => c.name === 'start_session_checkout')?.args).toEqual({ p_therapist: 't-x', p_mode: 'chat', p_start: iso(start) })
    expect(getDb().checkout).toMatchObject({ id: 'o-9', amountKes: 1500 })
  })

  it('passes on the server’s reason, such as one therapist at a time', async () => {
    fake({ replies: { start_session_checkout: { ok: false, code: 'one-therapist', error: 'You can work with one therapist at a time.' } } })
    expect(await remoteBilling.createCheckout({ kind: 'session', therapistId: 't-x', mode: 'chat', start: now() + 30 * HOUR })).toMatchObject({ ok: false, code: 'one-therapist' })
  })

  it('a paid session gives the session and its chat', async () => {
    fake({ replies: { start_session_checkout: { ok: true, order_id: 'o-9', amount_kes: 1500, title: 'x' }, simulate_payment: { ok: true, receipt_no: 'EC-222222', session_id: 's-1' }, my_sessions: { ok: true, sessions: [SESSION()] } } })
    await remoteBilling.createCheckout({ kind: 'session', therapistId: 't-x', mode: 'chat', start: now() + 30 * HOUR })
    const r = await remoteBilling.pay('mpesa')
    expect(r).toEqual({ ok: true, receiptNo: 'EC-222222', sessionId: 's-1' })
    expect(getDb().sessions.map((s) => s.id)).toEqual(['s-1'])
    expect(getDb().checkout).toBeNull()
  })

  it('tells the member when someone booked the time while they were paying', async () => {
    fake({ replies: { start_session_checkout: { ok: true, order_id: 'o-9', amount_kes: 1500, title: 'x' }, simulate_payment: { ok: false, code: 'taken', error: 'That time was just taken.' } } })
    await remoteBilling.createCheckout({ kind: 'session', therapistId: 't-x', mode: 'chat', start: now() + 30 * HOUR })
    expect(await remoteBilling.pay('mpesa')).toEqual({ ok: false, failure: 'taken' })
    expect(getDb().sessions).toEqual([])
  })

  it('a concern about a session goes to the server with the clinical reasons kept', () => {
    const calls = fake()
    remoteReport.submit({ target: 'session', targetId: 's-1', reason: 'therapist-boundaries', note: 'x', sessionId: 's-1' })
    expect(calls.find((c) => c.name === 'report_session')?.args).toEqual({ p_id: 's-1', p_reason: 'therapist-boundaries', p_note: 'x' })
  })
})
