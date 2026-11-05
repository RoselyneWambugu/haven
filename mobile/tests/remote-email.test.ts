import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { Platform } from 'react-native'
import { setClient } from '../src/backend/client'
import { remoteAuth } from '../src/backend/remoteAuth'
import type { RemoteAccount } from '../src/backend/map'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const ACCOUNT: RemoteAccount = {
  id: 'e1',
  standing: 'good',
  has_posted_before: false,
  has_password: true,
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

interface Script { hasAccount?: boolean; confirmOn?: boolean; signInError?: string; verifyError?: boolean; updateError?: string; session?: boolean; userId?: string }

/** A stand-in for Supabase Auth: it records what was asked and answers from the script. */
function fake(s: Script = {}) {
  const log: { name: string; args?: unknown }[] = []
  const user = { id: s.userId ?? 'e1', email: 'wanjiru@example.com', user_metadata: {} }
  setClient({
    auth: {
      signUp: async (a: unknown) => (log.push({ name: 'signUp', args: a }), { data: { session: s.confirmOn === false ? {} : null }, error: null }),
      signInWithPassword: async (a: unknown) => (log.push({ name: 'signInWithPassword', args: a }), { error: s.signInError ? { message: s.signInError, status: s.signInError === 'rate' ? 429 : 400 } : null }),
      resetPasswordForEmail: async (e: string, o: unknown) => (log.push({ name: 'reset', args: { e, o } }), { error: null }),
      verifyOtp: async (a: unknown) => (log.push({ name: 'verifyOtp', args: a }), { error: s.verifyError ? { message: 'expired' } : null }),
      updateUser: async (a: unknown) => (log.push({ name: 'updateUser', args: a }), { error: s.updateError ? { message: s.updateError } : null }),
      getSession: async () => ({ data: { session: s.session ? {} : null } }),
      getUser: async () => ({ data: { user } }),
      signOut: async () => ({ error: null }),
    },
    rpc: async (name: string) => {
      if (name === 'my_account') return { data: s.hasAccount ? ACCOUNT : null, error: null }
      if (name === 'trust_device') return { data: { ok: true, device_id: 'd1' }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return log
}

beforeEach(() => {
  resetClock()
  update({ ...freshState() } as never)
  ;(Platform as { OS: string }).OS = 'web'
  ;(globalThis as { location?: unknown }).location = { origin: 'https://echo.test', href: 'https://echo.test/' }
})

describe('signing up with an email', () => {
  it('checks the email and the password before asking Supabase', async () => {
    const log = fake()
    expect(await remoteAuth.signUpWithEmail('nope', 'quiet-river-42')).toMatchObject({ ok: false, code: 'email' })
    expect(await remoteAuth.signUpWithEmail('me@example.com', 'short')).toMatchObject({ ok: false, code: 'password' })
    expect(log).toHaveLength(0)
  })

  it('tells the person to check their email when a link has to be opened first', async () => {
    const log = fake()
    expect(await remoteAuth.signUpWithEmail('me@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'check-email' } })
    expect(log[0]).toMatchObject({ name: 'signUp', args: { email: 'me@example.com', options: { emailRedirectTo: 'https://echo.test/auth-callback' } } })
  })

  it('carries straight on to consent when no email confirmation is needed', async () => {
    fake({ confirmOn: false })
    expect(await remoteAuth.signUpWithEmail('me@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'consent' } })
    expect(getDb().reg).toMatchObject({ email: 'wanjiru@example.com', verified: true, phone: '' })
  })

  it('opening the confirmation link carries on to registration', async () => {
    const log = fake()
    const r = await remoteAuth.finishEmailLink('https://echo.test/auth-callback?token_hash=abc&type=signup')
    expect(r).toEqual({ ok: true, value: { next: 'consent' } })
    expect(log[0]).toMatchObject({ name: 'verifyOtp', args: { token_hash: 'abc', type: 'email' } })
  })
})

describe('logging in with an email', () => {
  it('signs an existing member in', async () => {
    fake({ hasAccount: true })
    expect(await remoteAuth.signInWithEmail('wanjiru@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'trust-device' } })
    expect(getDb().signedIn).toBe(true)
    expect(getDb().account?.hasPassword).toBe(true)
  })

  it('says the same thing whether the email or the password is wrong', async () => {
    fake({ signInError: 'Invalid login credentials' })
    expect(await remoteAuth.signInWithEmail('wanjiru@example.com', 'wrong-pass-1')).toEqual({ ok: false, error: 'That email and password don’t match.', code: 'wrong' })
  })

  it('says when the email has not been confirmed or there have been too many tries', async () => {
    fake({ signInError: 'Email not confirmed' })
    expect(await remoteAuth.signInWithEmail('wanjiru@example.com', 'quiet-river-42')).toMatchObject({ code: 'unconfirmed' })
    fake({ signInError: 'rate' })
    expect(await remoteAuth.signInWithEmail('wanjiru@example.com', 'quiet-river-42')).toMatchObject({ code: 'rate' })
  })
})

describe('forgot password', () => {
  it('sends the reset link to this site and gives the same answer for any address', async () => {
    const log = fake()
    expect(await remoteAuth.requestPasswordReset('anyone@example.com')).toEqual({ ok: true, value: undefined })
    expect(log[0]).toMatchObject({ name: 'reset', args: { e: 'anyone@example.com', o: { redirectTo: 'https://echo.test/auth-callback' } } })
    expect(await remoteAuth.requestPasswordReset('not an email')).toMatchObject({ ok: false, code: 'email' })
  })

  it('on a phone the link goes to the public web address, because the email opens in a browser', async () => {
    ;(Platform as { OS: string }).OS = 'ios'
    const log = fake()
    await remoteAuth.requestPasswordReset('anyone@example.com')
    expect(log[0]).toMatchObject({ args: { o: { redirectTo: 'https://haven-three-xi.vercel.app/auth-callback' } } })
  })

  it('the link opens the new-password page, and an old or used link is refused', async () => {
    fake()
    expect(await remoteAuth.finishEmailLink('https://echo.test/auth-callback?token_hash=abc&type=recovery')).toEqual({ ok: true, value: { next: 'reset-password' } })
    fake({ verifyError: true })
    expect(await remoteAuth.finishEmailLink('https://echo.test/auth-callback?token_hash=abc&type=recovery')).toMatchObject({ ok: false, code: 'link' })
    expect(await remoteAuth.finishEmailLink('https://echo.test/auth-callback')).toMatchObject({ ok: false, code: 'link' })
  })

  it('saving the new password signs the member in and takes them on', async () => {
    const log = fake({ hasAccount: true, session: true })
    expect(await remoteAuth.hasRecoverySession()).toBe(true)
    expect(await remoteAuth.setNewPassword('quiet-river-42')).toEqual({ ok: true, value: { next: 'trust-device' } })
    expect(log.find((l) => l.name === 'updateUser')?.args).toEqual({ password: 'quiet-river-42' })
    expect(getDb().signedIn).toBe(true)
  })

  it('refuses a weak or reused new password, and knows when there is no reset session', async () => {
    fake({ session: false })
    expect(await remoteAuth.hasRecoverySession()).toBe(false)
    expect(await remoteAuth.setNewPassword('weak')).toMatchObject({ ok: false, code: 'password' })
    fake({ updateError: 'New password should be different from the old password.' })
    expect(await remoteAuth.setNewPassword('quiet-river-42')).toMatchObject({ ok: false, error: 'Choose a password you haven’t used before.' })
  })
})

describe('opening the private profile with a password', () => {
  it('works for the signed-in member only', async () => {
    fake({ hasAccount: true })
    update({ account: { ...ACCOUNT, id: 'e1' } as never })
    update({ account: { id: 'e1' } as never })
    expect(await remoteAuth.reauthWithPassword('quiet-river-42')).toEqual({ ok: true, value: undefined })
    expect(getDb().reauthUntil).toBeGreaterThan(0)
    update({ reauthUntil: 0 })
    fake({ hasAccount: true, signInError: 'Invalid login credentials' })
    expect(await remoteAuth.reauthWithPassword('wrong-pass-1')).toMatchObject({ ok: false, code: 'wrong' })
    expect(getDb().reauthUntil).toBe(0)
    fake({ userId: 'someone-else' })
    expect(await remoteAuth.reauthWithPassword('quiet-river-42')).toMatchObject({ ok: false, code: 'mismatch' })
  })
})
