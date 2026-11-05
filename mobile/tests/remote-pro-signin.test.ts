import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Platform } from 'react-native'
import { browser } from './stubs/expo-web-browser'
import { setClient } from '../src/backend/client'
import { remoteAuth } from '../src/backend/remoteAuth'
import { stopAdminPolling } from '../src/backend/remoteAdmin'
import { stopPortalPolling } from '../src/backend/remotePortal'
import { stopPolling } from '../src/backend/remoteChat'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const PORTAL = {
  ok: true, therapist_id: 't-amina', paused: false,
  caps: { dailySessions: 6, newClientsPerWeek: 4 }, profile: { name: 'Dr. Amina', title: 'Counsellor', bio: 'Hello.', specialisations: ['Grief'], languages: ['English'], modes: ['chat'], priceKes: 1500, acceptingNew: true },
  availability: [], time_off: [], payout: { method: '', schedule: 'weekly' }, licence_valid_to: 1893456000000, sessions: [], threads: [], concerns: [],
}
const ADMIN = {
  ok: true, name: 'T. Njeri', role: 'moderator', heavy: false, staff: [{ id: 'a1', name: 'T. Njeri', role: 'moderator', active: true, last_sign_in_at: null }],
  cases: [], users: [], appeals: [], held: [], therapists: [], audit: [], revealed: [],
}

interface Script { therapist?: boolean; staff?: boolean; member?: boolean; setupOpen?: boolean }

/** A stand-in for Supabase where the person who signs in with Google or an email is a therapist, staff, a member, or no one yet. */
function fake(s: Script = {}) {
  const calls: string[] = []
  setClient({
    auth: {
      signInWithOAuth: async () => ({ data: { url: 'https://accounts.google.test/auth' }, error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      signInWithPassword: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'u1', email: 'amina@example.com', user_metadata: {}, identities: [{ provider: 'google' }, { provider: 'email' }], phone: '254712345678' } } }),
      signOut: async () => (calls.push('signOut'), { error: null }),
    },
    rpc: async (name: string) => {
      calls.push(name)
      if (name === 'my_account') return { data: null, error: null }
      if (name === 'my_portal') return { data: s.therapist ? PORTAL : { ok: false, code: 'not-therapist' }, error: null }
      if (name === 'staff_me') return { data: s.staff ? { ok: true, name: 'T. Njeri', role: 'moderator' } : { ok: false, code: 'not-staff' }, error: null }
      if (name === 'admin_state') return { data: s.staff ? ADMIN : { ok: false, code: 'not-staff' }, error: null }
      if (name === 'setup_open') return { data: { open: s.setupOpen === true }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

afterEach(() => {
  stopAdminPolling()
  stopPortalPolling()
  stopPolling()
  setClient(null)
})

beforeEach(() => {
  resetClock()
  update({ ...freshState() } as never)
  ;(Platform as { OS: string }).OS = 'ios'
  browser.result = { type: 'success', url: 'exp://test.host/--/auth-callback?code=abc' }
})

describe('therapist sign-in with Google or an email', () => {
  it('opens the portal for a linked therapist', async () => {
    fake({ therapist: true })
    update({ signedIn: true } as never)
    const r = await remoteAuth.signInWithGoogle('portal')
    expect(r).toEqual({ ok: true, value: { next: 'portal' } })
    expect(getDb().signedIn).toBe(false)
  })

  it('refuses someone who is not a therapist, names the email, and ends the sign-in', async () => {
    const calls = fake()
    const r = await remoteAuth.signInWithGoogle('portal')
    expect(r).toMatchObject({ ok: false, code: 'not-therapist', error: 'This email isn’t linked to a therapist account. Ask Echo to link it.' })
    expect(calls).toContain('signOut')
  })

  it('works with an email and password too', async () => {
    fake({ therapist: true })
    expect(await remoteAuth.signInWithEmail('amina@example.com', 'quiet-river-42', 'portal')).toEqual({ ok: true, value: { next: 'portal' } })
  })
})

describe('staff sign-in with Google or an email', () => {
  it('opens the dashboard for linked staff', async () => {
    fake({ staff: true })
    expect(await remoteAuth.signInWithGoogle('admin')).toEqual({ ok: true, value: { next: 'admin' } })
    expect(await remoteAuth.signInWithEmail('t@example.com', 'quiet-river-42', 'admin')).toEqual({ ok: true, value: { next: 'admin' } })
  })

  it('refuses someone who is not staff', async () => {
    const calls = fake()
    expect(await remoteAuth.signInWithGoogle('admin')).toMatchObject({ ok: false, code: 'not-staff', error: 'This email isn’t linked to a staff account. Ask an Admin to link it.' })
    expect(calls).toContain('signOut')
  })

  it('keeps the sign-in so the first Admin can finish setup', async () => {
    const calls = fake({ setupOpen: true })
    const r = await remoteAuth.signInWithGoogle('admin')
    expect(r).toMatchObject({ ok: false, code: 'setup' })
    expect(calls).not.toContain('signOut')
  })
})

describe('signing in from the member screens', () => {
  it('takes a linked therapist to the portal instead of member registration', async () => {
    fake({ therapist: true })
    expect(await remoteAuth.signInWithGoogle('login')).toEqual({ ok: true, value: { next: 'portal' } })
  })

  it('takes linked staff to the dashboard', async () => {
    fake({ staff: true })
    expect(await remoteAuth.signInWithEmail('t@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'admin' } })
  })

  it('still carries a stranger on to registration', async () => {
    const calls = fake()
    expect(await remoteAuth.signInWithGoogle('login')).toEqual({ ok: true, value: { next: 'consent' } })
    expect(calls).not.toContain('signOut')
  })
})

describe('sign-in methods for someone without a member account', () => {
  it('are read from Supabase', async () => {
    fake()
    expect(await remoteAuth.signInMethods()).toEqual({ phone: '+254712345678', email: 'amina@example.com', google: true, password: true })
  })
})
