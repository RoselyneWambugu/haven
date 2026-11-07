import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { Platform } from 'react-native'
import { browser } from './stubs/expo-web-browser'
import { setClient } from '../src/backend/client'
import { remoteAuth } from '../src/backend/remoteAuth'
import type { RemoteAccount } from '../src/backend/map'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const ACCOUNT: RemoteAccount = {
  id: 'g1',
  standing: 'good',
  has_posted_before: false,
  has_google: true,
  deletion_requested_at: null,
  trusted_device: true,
  shared_device: false,
  mood: null,
  settings: {},
  created_at: '2026-10-21T08:00:00Z',
  public: { pen_name: 'QuietPine', avatar: 'moon', languages: ['English'], topics: [], age_band: '25-34', open_to_chats: true, pen_name_changed_at: null },
  private: { full_name: 'Wanjiru Kamau', phone: null, email: 'wanjiru@example.com', date_of_birth: '1995-05-05', id_verified: false },
  consents: { version: '2026-10', terms: true, privacy: true, guidelines: true, moderation: true, at: '2026-10-21T08:00:00Z' },
  devices: [],
}

/** A stand-in for Supabase that plays Google: a code in the return address becomes a session for `user`. */
function fake(opts: { hasAccount?: boolean; userId?: string } = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const oauth: { options?: Record<string, unknown> }[] = []
  const state = { account: opts.hasAccount ? ACCOUNT : null, exchanged: [] as string[] }
  const user = { id: opts.userId ?? 'g1', email: 'wanjiru@example.com', user_metadata: { full_name: 'Wanjiru Kamau' } }
  setClient({
    auth: {
      signInWithOAuth: async (o: { options?: Record<string, unknown> }) => (oauth.push(o), { data: { url: 'https://accounts.google.test/auth' }, error: null }),
      exchangeCodeForSession: async (code: string) => (state.exchanged.push(code), { error: code === 'bad' ? { message: 'bad code' } : null }),
      getUser: async () => ({ data: { user } }),
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: {} } }),
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'my_account') return { data: state.account, error: null }
      if (name === 'trust_device') return { data: { ok: true, device_id: 'd1' }, error: null }
      if (name === 'register_member') {
        state.account = ACCOUNT
        return { data: { ok: true }, error: null }
      }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return { calls, oauth, state }
}

beforeEach(() => {
  resetClock()
  update({ ...freshState() } as never)
  ;(Platform as { OS: string }).OS = 'ios'
  browser.opened.length = 0
  browser.result = { type: 'success', url: 'exp://test.host/--/auth-callback?code=abc' }
})

describe('Google on a phone', () => {
  it('signs an existing member in', async () => {
    const f = fake({ hasAccount: true })
    const r = await remoteAuth.signInWithGoogle('login')
    expect(r).toEqual({ ok: true, value: { next: 'trust-device' } })
    expect(getDb().signedIn).toBe(true)
    expect(getDb().account?.private.phone).toBe('')
    expect(getDb().account?.hasGoogle).toBe(true)
    expect(f.state.exchanged).toEqual(['abc'])
    expect(browser.opened).toHaveLength(1)
  })

  it('asks Google to let the person pick an account, and for a fresh check when proving it is them', async () => {
    const f = fake({ hasAccount: true })
    await remoteAuth.signInWithGoogle('login')
    expect((f.oauth[0].options?.queryParams as { prompt: string }).prompt).toBe('select_account')
    update({ account: { ...getDb().account!, id: 'g1' } } as never)
    await remoteAuth.signInWithGoogle('reauth')
    expect((f.oauth[1].options?.queryParams as { prompt: string }).prompt).toBe('login')
  })

  it('takes a new person to registration with their Google name and email, no password and no phone', async () => {
    const f = fake()
    const r = await remoteAuth.signInWithGoogle('register')
    expect(r).toEqual({ ok: true, value: { next: 'register' } })
    expect(getDb().reg).toMatchObject({ email: 'wanjiru@example.com', fullName: 'Wanjiru Kamau', phone: '', verified: true })
    expect(getDb().signedIn).toBe(false)

    expect((await remoteAuth.signInWithGoogle('register')).ok && getDb().reg?.verified).toBe(true)
    // Google already proved the email, so there is no password to make.
    const d = remoteAuth.submitDetails({ fullName: 'Wanjiru Kamau', dob: '05/05/1995', email: 'wanjiru@example.com', password: null })
    expect(d.ok).toBe(true)
    expect(getDb().reg).toMatchObject({ phone: '', verified: true })
    update((s) => ({ reg: { ...s.reg!, penName: 'QuietPine', consentsAcceptedAt: 1 } }))
    expect((await remoteAuth.completeRegistration('ios')).ok).toBe(true)
    expect(f.calls.find((c) => c.name === 'register_member')?.args).toMatchObject({ p_full_name: 'Wanjiru Kamau', p_date_of_birth: '1995-05-05' })
    expect(getDb().signedIn).toBe(true)
  })

  it('still checks the age and name on a Google registration', async () => {
    fake()
    await remoteAuth.signInWithGoogle('register')
    expect(remoteAuth.submitDetails({ fullName: 'W', dob: '05/05/1995', email: 'wanjiru@example.com', password: null })).toMatchObject({ ok: false, code: 'name' })
    expect(remoteAuth.submitDetails({ fullName: 'Young Person', dob: '05/05/2015', email: 'wanjiru@example.com', password: null })).toMatchObject({ ok: false, code: 'under-18' })
  })

  it('says nothing went wrong when the person closes the Google window', async () => {
    fake()
    browser.result = { type: 'cancel' }
    expect(await remoteAuth.signInWithGoogle('login')).toMatchObject({ ok: false, code: 'cancelled' })
  })

  it('gives a plain message when the code does not work', async () => {
    fake()
    browser.result = { type: 'success', url: 'exp://test.host/--/auth-callback?code=bad' }
    expect(await remoteAuth.signInWithGoogle('login')).toMatchObject({ ok: false, code: 'google' })
    browser.result = { type: 'success', url: 'exp://test.host/--/auth-callback?error=access_denied' }
    expect(await remoteAuth.signInWithGoogle('login')).toMatchObject({ ok: false, code: 'google' })
  })

  it('opens the private profile again only for the Google account that is signed in', async () => {
    fake({ hasAccount: true, userId: 'someone-else' })
    update({ account: { ...ACCOUNT, id: 'g1' } as never, signedIn: true } as never)
    update({ account: { ...getDb().account!, id: 'g1' } } as never)
    expect(await remoteAuth.signInWithGoogle('reauth')).toMatchObject({ ok: false, code: 'mismatch' })
    expect(getDb().reauthUntil).toBe(0)

    fake({ hasAccount: true, userId: 'g1' })
    expect(await remoteAuth.signInWithGoogle('reauth')).toEqual({ ok: true, value: { next: 'reauth-ok' } })
    expect(getDb().reauthUntil).toBeGreaterThan(0)
  })
})

describe('Google on the web', () => {
  beforeEach(() => {
    ;(Platform as { OS: string }).OS = 'web'
    ;(globalThis as { location?: unknown }).location = { origin: 'https://echo.test', href: 'https://echo.test/auth-callback?code=abc' }
  })

  it('leaves the page for Google, then finishes on the page Google sends it back to', async () => {
    const f = fake({ hasAccount: true })
    const r = await remoteAuth.signInWithGoogle('login')
    expect(r).toEqual({ ok: true, value: { next: 'redirecting' } })
    expect(browser.opened).toHaveLength(0)
    expect(f.oauth[0].options).toMatchObject({ redirectTo: 'https://echo.test/auth-callback', skipBrowserRedirect: false })

    const back = await remoteAuth.finishGoogleRedirect('https://echo.test/auth-callback?code=abc')
    expect(back).toEqual({ ok: true, value: { next: 'trust-device' } })
    expect(getDb().signedIn).toBe(true)
  })

  it('ignores the same return address a second time', async () => {
    fake({ hasAccount: true })
    await remoteAuth.signInWithGoogle('login')
    await remoteAuth.finishGoogleRedirect('https://echo.test/auth-callback?code=abc')
    expect(await remoteAuth.finishGoogleRedirect('https://echo.test/auth-callback?code=abc')).toMatchObject({ ok: false, code: 'stale' })
  })
})
