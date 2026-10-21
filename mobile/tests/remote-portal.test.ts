import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setClient } from '../src/backend/client'
import { portalRequestOtp, portalVerifyOtp, remotePortal, stopPortalPolling, syncPortal } from '../src/backend/remotePortal'
import { stopPolling } from '../src/backend/remoteChat'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock, now } from '../src/lib/clock'

const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()
const PORTAL = () => ({
  ok: true, therapist_id: 't-amina', paused: false, caps: { perDay: 5, bufferMin: 15, newPerWeek: 3 },
  profile: { bio: 'I help people feel heard.', specialisations: ['Grief'], languages: ['English'], modes: ['chat'], priceKes: 1500 },
  availability: [{ dow: 1, start: '09:00', end: '12:00', modes: ['chat'] }], time_off: [{ id: 'o1', start: now() + 24 * HOUR, end: now() + 48 * HOUR }],
  payout: { method: 'M-Pesa 0722 ••• 114', schedule: 'weekly' }, licence_valid_to: now() + 90 * 24 * HOUR,
  sessions: [{ id: 's1', client_key: 'k1', client_name: 'QuietPine', client_avatar: 'pine', mode: 'chat', start: now() + HOUR, end: now() + 2 * HOUR, number: 1, status: 'booked', attendance: null, note: '', follow_up: null, gross_kes: null }],
  threads: [{ id: 'c1', client_name: 'QuietPine', client_avatar: 'pine', unread: 1, closed: false, next_session: now() + HOUR, messages: [{ id: 'm1', from: 'them', text: 'Hello', at: iso(now()) }] }],
  concerns: [],
})

interface Script { replies?: Record<string, unknown>; verify?: boolean; user?: { phone: string } }

function fake(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const auth = { signedOut: 0, otps: [] as string[] }
  setClient({
    auth: {
      signInWithOtp: async ({ phone }: { phone: string }) => (auth.otps.push(phone), { error: null }),
      verifyOtp: async () => ({ error: script.verify === false ? { message: 'bad' } : null }),
      signOut: async () => ((auth.signedOut += 1), { error: null }),
      getUser: async () => ({ data: { user: script.user ?? { phone: '254712000051' } } }),
      getSession: async () => ({ data: { session: {} } }),
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (script.replies && name in script.replies) return { data: script.replies[name], error: null }
      if (name === 'my_portal') return { data: PORTAL(), error: null }
      if (name === 'forum_feed') return { data: { ok: true, posts: [], spaces: [] }, error: null }
      if (name === 'therapist_directory') return { data: { ok: true, therapists: [] }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return { calls, auth }
}

beforeEach(() => {
  resetClock()
  update({ ...freshState(), signedIn: true } as never)
})
afterEach(() => {
  stopPortalPolling()
  stopPolling()
  vi.useRealTimers()
})

describe('signing in', () => {
  it('opens the portal when the number belongs to a therapist, and signs the member app out', async () => {
    const f = fake()
    expect((await portalRequestOtp('+254712000051')).ok).toBe(true)
    expect(f.auth.otps).toEqual(['+254712000051'])
    const r = await portalVerifyOtp('123456')
    expect(r.ok).toBe(true)
    expect(getDb().portal?.signedIn).toBe(true)
    expect(getDb().portal?.therapistId).toBe('t-amina')
    expect(getDb().signedIn).toBe(false)
    expect(getDb().account).toBeNull()
  })

  it('signs out again when the number isn’t linked to a therapist', async () => {
    const f = fake({ replies: { my_portal: { ok: false, code: 'not-therapist', error: 'no' } } })
    await portalRequestOtp('+254712000099')
    const r = await portalVerifyOtp('123456')
    expect(r).toMatchObject({ ok: false, code: 'not-therapist' })
    expect(getDb().portal).toBeNull()
    expect(f.auth.signedOut).toBe(1)
  })

  it('rejects a wrong code', async () => {
    fake({ verify: false })
    await portalRequestOtp('+254712000051')
    expect(await portalVerifyOtp('000000')).toMatchObject({ ok: false, code: 'wrong' })
    expect(getDb().portal).toBeNull()
  })
})

describe('what the portal shows', () => {
  it('turns the server’s reply into the portal screens’ data', async () => {
    fake()
    expect(await syncPortal()).toBe(true)
    const p = getDb().portal!
    expect(p).toMatchObject({ signedIn: true, application: 'approved', paused: false, caps: { perDay: 5 } })
    expect(p.sessions[0]).toMatchObject({ id: 's1', clientName: 'QuietPine', status: 'booked', grossKes: null, number: 1 })
    expect(p.threads[0]).toMatchObject({ id: 'c1', unread: 1, closed: false })
    expect(p.threads[0].messages[0]).toMatchObject({ from: 'them', text: 'Hello' })
    expect(p.timeOff).toHaveLength(1)
  })

  it('keeps what it had when the server can’t be reached', async () => {
    fake()
    await syncPortal()
    setClient({ rpc: async () => ({ data: null, error: { message: 'down' } }) } as unknown as SupabaseClient)
    await syncPortal()
    expect(getDb().portal?.sessions).toHaveLength(1)
  })
})

describe('working in the portal', () => {
  beforeEach(async () => {
    fake()
    await syncPortal()
  })

  it('sends a message through the server, and stops contact details on the device first', async () => {
    const f = fake()
    expect(await remotePortal.send('c1', 'call me on 0712 345 678')).toMatchObject({ ok: false, code: 'blocked' })
    expect(f.calls.some((c) => c.name === 'portal_send')).toBe(false)
    expect((await remotePortal.send('c1', ' Hello again ')).ok).toBe(true)
    expect(f.calls.find((c) => c.name === 'portal_send')?.args).toEqual({ p_conversation: 'c1', p_text: 'Hello again' })
  })

  it('passes on the server’s reasons for joining and wrapping up', async () => {
    fake({ replies: { portal_join_session: { ok: false, code: 'early', error: 'The session isn’t open yet.' } } })
    expect(await remotePortal.join('s1')).toMatchObject({ ok: false, code: 'early' })
    const f = fake()
    await remotePortal.wrapUp('s1', { attendance: 'attended', note: 'Good.', followUp: now() + 7 * 24 * HOUR })
    expect(f.calls.find((c) => c.name === 'portal_wrap_up')?.args).toMatchObject({ p_id: 's1', p_attendance: 'attended', p_note: 'Good.' })
  })

  it('tells the therapist how many clients were told about time off', async () => {
    fake({ replies: { portal_add_time_off: { ok: true, notified: 2 } } })
    expect(await remotePortal.addTimeOff(now(), now() + 24 * HOUR)).toEqual({ ok: true, value: { notified: 2 } })
  })

  it('shows the server’s reasons when a profile is refused', async () => {
    fake({ replies: { portal_save_profile: { ok: false, code: 'solicit', error: 'Describe how you work, not how to reach you outside Echo.' } } })
    expect(await remotePortal.saveProfile({ bio: 'x'.repeat(30), specialisations: ['Grief'], languages: ['English'], modes: ['chat'], priceKes: 1500 })).toMatchObject({ ok: false, code: 'solicit' })
  })

  it('saves the weekly hours a moment after the last tap', async () => {
    vi.useFakeTimers()
    const f = fake()
    remotePortal.setCell(1, 9)
    remotePortal.setCell(1, 10)
    expect(f.calls.some((c) => c.name === 'portal_save_availability')).toBe(false)
    await vi.advanceTimersByTimeAsync(700)
    expect(f.calls.filter((c) => c.name === 'portal_save_availability')).toHaveLength(1)
  })

  it('pausing and the daily limit go to the server', () => {
    const f = fake()
    remotePortal.setPaused(true)
    remotePortal.setCaps({ perDay: 3 })
    expect(f.calls.find((c) => c.name === 'portal_set_paused')?.args).toEqual({ p_paused: true })
    expect(f.calls.find((c) => c.name === 'portal_set_caps')?.args).toEqual({ p_per_day: 3, p_buffer: null, p_new: null })
  })

  it('needs a fresh code to change the payout, and passes on the server’s answer', async () => {
    fake({ replies: { portal_change_payout: { ok: false, code: 'reauth', error: 'Check it’s you first.' } } })
    expect(await remotePortal.changePayout('M-Pesa 0722 111 114', 'monthly')).toMatchObject({ ok: false, code: 'reauth' })
    const f = fake()
    await remotePortal.reauthStart()
    expect(f.auth.otps).toEqual(['+254712000051'])
    expect(await remotePortal.reauth('123456')).toEqual({ ok: true, value: undefined })
    expect(getDb().portal!.reauthUntil).toBeGreaterThan(now())
  })

  it('raises a concern through the server', async () => {
    fake({ replies: { portal_raise_concern: { ok: true, id: 'k9' } } })
    expect(await remotePortal.raiseConcern({ sessionId: 's1', danger: true, type: 'self-harm', detail: 'x' })).toEqual({ ok: true, value: { id: 'k9' } })
  })

  it('signing out clears the portal from the device', async () => {
    const f = fake()
    remotePortal.signOut()
    expect(getDb().portal).toBeNull()
    await Promise.resolve()
    expect(f.auth.signedOut).toBe(1)
  })
})
