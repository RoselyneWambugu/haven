import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteFeedback, syncFeedback } from '../src/backend/remoteFeedback'
import { applicantRequestOtp, applicantVerifyOtp, parseExpiry, refreshApplication, submitApplication } from '../src/backend/remoteApplication'
import { remoteAdmin, syncAdmin } from '../src/backend/remoteAdmin'
import { stopPortalPolling } from '../src/backend/remotePortal'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock, now } from '../src/lib/clock'

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const auth = { otps: [] as string[], signedOut: 0 }
  setClient({
    auth: {
      signInWithOtp: async ({ phone }: { phone: string }) => (auth.otps.push(phone), { error: null }),
      verifyOtp: async () => ({ error: null }),
      signOut: async () => ((auth.signedOut += 1), { error: null }),
      getSession: async () => ({ data: { session: {} } }),
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name in replies) return { data: replies[name], error: null }
      if (name === 'my_portal') return { data: { ok: false, code: 'not-therapist' }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return { calls, auth }
}

beforeEach(() => {
  resetClock()
  update({ ...freshState() } as never)
})
afterEach(() => {
  stopPortalPolling()
  setClient(null)
})

describe('member feedback', () => {
  it('keeps the felt-heard answer on the server and on the chat', async () => {
    const f = fake()
    update({ conversations: [{ id: 'c1', messages: [] } as never] })
    expect((await remoteFeedback.rateHeard('c1', 4, ' Good listener ')).ok).toBe(true)
    expect(f.calls[0]).toEqual({ name: 'rate_heard', args: { p_conversation: 'c1', p_score: 4, p_comment: 'Good listener' } })
    expect(getDb().conversations[0].heard).toEqual({ score: 4, comment: 'Good listener' })
  })

  it('does not mark an answer that the server refused', async () => {
    fake({ rate_heard: { ok: false, code: 'gone', error: 'That conversation is gone.' } })
    update({ conversations: [{ id: 'c1', messages: [] } as never] })
    expect((await remoteFeedback.rateHeard('c1', 4, '')).ok).toBe(false)
    expect(getDb().conversations[0].heard).toBeUndefined()
  })

  it('checks a note before sending, then sends it', async () => {
    const f = fake()
    expect((await remoteFeedback.send('idea', '   ', true)).ok).toBe(false)
    expect(f.calls).toHaveLength(0)
    expect((await remoteFeedback.send('idea', 'Please add dark mode', true)).ok).toBe(true)
    expect(f.calls[0]).toEqual({ name: 'send_feedback', args: { p_kind: 'idea', p_text: 'Please add dark mode', p_with_device: true } })
  })

  it('shows staff the notes and the shares the server worked out', async () => {
    fake({ admin_feedback: { ok: true, notes: [{ id: 'fb1', kind: 'idea', text: 'Dark mode', at: now(), withDevice: false }], heard: { answered: 12, skipped: null, shares: [0, 8, 8, 17, 67], positive: 84 } } })
    update({ admin: { signedIn: true } as never })
    await syncFeedback()
    expect(getDb().feedback).toHaveLength(1)
    expect(getDb().admin?.heardSummary?.positive).toBe(84)
  })

  it('marks a note as read through the server', async () => {
    const f = fake()
    await remoteFeedback.review('fb1')
    expect(f.calls[0]).toEqual({ name: 'admin_review_feedback', args: { p_id: 'fb1' } })
  })
})

describe('applying to be a therapist', () => {
  it('signs in with a phone code, signs everyone else out and loads the application', async () => {
    const f = fake({ my_application: { ok: true, status: 'info', message: 'Send a clearer copy', name: 'Dr Test' } })
    expect((await applicantRequestOtp('+254712000164')).ok).toBe(true)
    expect(f.auth.otps).toEqual(['+254712000164'])
    update({ signedIn: true } as never)
    const r = await applicantVerifyOtp('123456')
    expect(r).toEqual({ ok: true, value: { therapist: false } })
    expect(getDb().signedIn).toBe(false)
    expect(getDb().application).toEqual({ status: 'info', message: 'Send a clearer copy', name: 'Dr Test' })
  })

  it('goes straight to the portal when the number already belongs to a therapist', async () => {
    fake({ my_portal: { ok: true, therapist_id: 't-1', paused: false, caps: { perDay: 5, bufferMin: 15, newPerWeek: 3 }, profile: { bio: '', specialisations: [], languages: [], modes: [], priceKes: null }, availability: [], time_off: [], payout: { method: '', schedule: 'weekly' }, licence_valid_to: now(), sessions: [], threads: [], concerns: [] } })
    await applicantRequestOtp('+254712000164')
    expect(await applicantVerifyOtp('123456')).toEqual({ ok: true, value: { therapist: true } })
    expect(getDb().portal?.signedIn).toBe(true)
  })

  it('sends the details and shows the server’s refusal', async () => {
    const f = fake({ my_application: { ok: true, status: 'pending', message: '', name: 'Dr Test' } })
    const ok = await submitApplication({ name: 'Dr Test', title: 'Counsellor', gender: 'woman', licenceNumber: 'L-1', licenceExpiry: '2027-03-31', consentPublic: true, consentConduct: true })
    expect(ok.ok).toBe(true)
    expect(f.calls[0].args).toMatchObject({ p_licence_number: 'L-1', p_licence_expiry: '2027-03-31', p_gender: 'woman' })
    expect(getDb().application?.status).toBe('pending')
    fake({ submit_application: { ok: false, code: 'expiry', error: 'Your licence must be valid.' } })
    expect(await submitApplication({ name: 'Dr Test', title: 'x', gender: 'man', licenceNumber: 'L-1', licenceExpiry: '2020-01-01', consentPublic: true, consentConduct: true })).toMatchObject({ ok: false, code: 'expiry' })
  })

  it('refreshes the status after a decision', async () => {
    fake({ my_application: { ok: true, status: 'approved', message: 'Welcome to Echo', name: 'Dr Test' } })
    await refreshApplication()
    expect(getDb().application?.status).toBe('approved')
  })

  it('reads an expiry date only as year-month-day', () => {
    expect(parseExpiry('2027-03-31')).toBe('2027-03-31')
    expect(parseExpiry('31/03/2027')).toBeNull()
    expect(parseExpiry('2027-13-45')).toBeNull()
  })
})

describe('staff verifying applicants', () => {
  it('lists applicants from the server and sends decisions there', async () => {
    const f = fake({
      admin_state: { ok: true, name: 'C. Clin', role: 'clinical', staff: [], cases: [], users: [], appeals: [], held: [], therapists: [], audit: [], revealed: [] },
      admin_applicants: { ok: true, applicants: [{ id: 'ap1', name: 'Dr Test', licenceNo: 'L-1', licenceExpiry: now(), checklist: { name: false, licence: false, expiry: false, qualification: false }, status: 'pending', message: '' }] },
    })
    await syncAdmin()
    expect(remoteAdmin.applicants()).toHaveLength(1)
    await remoteAdmin.verify('ap1', 'approved', 'Welcome to Echo', { name: true, licence: true, expiry: true, qualification: true })
    expect(f.calls.find((c) => c.name === 'admin_verify_applicant')?.args).toEqual({ p_id: 'ap1', p_decision: 'approved', p_message: 'Welcome to Echo', p_checklist: { name: true, licence: true, expiry: true, qualification: true } })
  })

  it('passes the checklist refusal back', async () => {
    fake({ admin_verify_applicant: { ok: false, code: 'checklist', error: 'Tick every check before approving.' } })
    expect(await remoteAdmin.verify('ap1', 'approved', 'Welcome', { name: true, licence: false, expiry: true, qualification: true })).toMatchObject({ ok: false, code: 'checklist' })
  })
})
