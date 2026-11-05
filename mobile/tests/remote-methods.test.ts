import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { Platform } from 'react-native'
import { browser } from './stubs/expo-web-browser'
import { setClient } from '../src/backend/client'
import { remoteAuth } from '../src/backend/remoteAuth'
import { toAccount, type RemoteAccount } from '../src/backend/map'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const base: RemoteAccount = {
  id: 'p1',
  standing: 'good',
  has_posted_before: false,
  deletion_requested_at: null,
  trusted_device: true,
  shared_device: false,
  mood: null,
  settings: {},
  created_at: '2026-10-21T08:00:00Z',
  public: { pen_name: 'QuietPine', avatar: 'moon', languages: ['English'], topics: [], age_band: '25-34', open_to_chats: true, pen_name_changed_at: null },
  private: { full_name: 'Wanjiru Kamau', phone: '+254712345678', email: '', date_of_birth: '1995-05-05', id_verified: false },
  consents: { version: '2026-10', terms: true, privacy: true, guidelines: true, moderation: true, at: '2026-10-21T08:00:00Z' },
  devices: [],
}

/** A phone-number member who is signed in; the stand-in answers account reads from `account` so the test can change it. */
function fake(o: { userId?: string; updateError?: string; verifyError?: boolean; syncCode?: string; exchangeError?: boolean } = {}) {
  const log: { name: string; args?: unknown }[] = []
  const state = { account: base }
  setClient({
    auth: {
      linkIdentity: async (a: unknown) => (log.push({ name: 'linkIdentity', args: a }), { data: { url: 'https://accounts.google.test/link' }, error: null }),
      exchangeCodeForSession: async () => ({ error: o.exchangeError ? { message: 'Identity is already linked to another user' } : null }),
      updateUser: async (a: unknown) => (log.push({ name: 'updateUser', args: a }), { error: o.updateError ? { message: o.updateError } : null }),
      verifyOtp: async (a: unknown) => (log.push({ name: 'verifyOtp', args: a }), { error: o.verifyError ? { message: 'bad' } : null }),
      getUser: async () => ({ data: { user: { id: o.userId ?? 'p1', email: 'wanjiru@example.com', user_metadata: {} } } }),
    },
    rpc: async (name: string) => {
      log.push({ name })
      if (name === 'my_account') return { data: state.account, error: null }
      if (name === 'sync_sign_in_methods') {
        if (o.syncCode) return { data: { ok: false, code: o.syncCode, error: 'That number is already on another Echo account.' }, error: null }
        state.account = { ...state.account, has_google: true, private: { ...state.account.private, email: 'wanjiru@example.com' } }
        return { data: { ok: true }, error: null }
      }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return { log, state }
}

beforeEach(() => {
  resetClock()
  update({ ...freshState(), signedIn: true } as never)
  ;(Platform as { OS: string }).OS = 'ios'
  ;(globalThis as { location?: unknown }).location = { origin: 'https://echo.test', href: 'https://echo.test/' }
  browser.opened.length = 0
  browser.result = { type: 'success', url: 'exp://test.host/--/auth-callback?code=abc' }
  update({ account: toAccount(base, null, null) })
})

describe('adding Google to the account that is signed in', () => {
  it('links instead of signing in as someone else, then copies the email into the account', async () => {
    const f = fake()
    const r = await remoteAuth.linkGoogle()
    expect(r).toEqual({ ok: true, value: { next: 'linked' } })
    expect(f.log.some((l) => l.name === 'linkIdentity')).toBe(true)
    expect(f.log.some((l) => l.name === 'sync_sign_in_methods')).toBe(true)
    expect(getDb().account?.hasGoogle).toBe(true)
    expect(getDb().account?.private.email).toBe('wanjiru@example.com')
  })

  it('says so when that Google account already belongs to another Echo account', async () => {
    fake({ exchangeError: true })
    expect(await remoteAuth.linkGoogle()).toMatchObject({ ok: false, code: 'google' })
  })
})

describe('adding an email and password', () => {
  it('checks them, then asks Supabase to add them and email a confirmation link', async () => {
    const f = fake()
    expect(await remoteAuth.addEmailPassword('nope', 'quiet-river-42')).toMatchObject({ code: 'email' })
    expect(await remoteAuth.addEmailPassword('me@example.com', 'weak')).toMatchObject({ code: 'password' })
    expect(f.log).toHaveLength(0)
    expect(await remoteAuth.addEmailPassword('me@example.com', 'quiet-river-42')).toEqual({ ok: true, value: undefined })
    expect(f.log[0]).toMatchObject({ name: 'updateUser', args: { email: 'me@example.com', password: 'quiet-river-42' } })
  })

  it('says when the email belongs to another account', async () => {
    fake({ updateError: 'A user with this email address has already been registered' })
    expect(await remoteAuth.addEmailPassword('me@example.com', 'quiet-river-42')).toMatchObject({ ok: false, code: 'taken' })
  })

  it('the confirmation link finishes the link and goes back to the sign-in methods', async () => {
    const f = fake()
    const r = await remoteAuth.finishEmailLink('https://echo.test/auth-callback?token_hash=abc&type=email_change')
    expect(r).toEqual({ ok: true, value: { next: 'linked' } })
    expect(f.log[0]).toMatchObject({ name: 'verifyOtp', args: { token_hash: 'abc', type: 'email_change' } })
    expect(f.log.some((l) => l.name === 'sync_sign_in_methods')).toBe(true)
  })
})

describe('adding a phone number', () => {
  it('sends a code to a valid Kenyan number, then confirms it and updates the account', async () => {
    const f = fake()
    expect(await remoteAuth.requestAddPhone('12')).toMatchObject({ code: 'phone' })
    const sent = await remoteAuth.requestAddPhone('0712 345 678')
    expect(sent).toEqual({ ok: true, value: { phone: '+254712345678' } })
    expect(f.log.find((l) => l.name === 'updateUser')?.args).toEqual({ phone: '+254712345678' })
    expect(await remoteAuth.confirmAddPhone('+254712345678', '123456')).toEqual({ ok: true, value: undefined })
    expect(f.log.find((l) => l.name === 'verifyOtp')?.args).toEqual({ phone: '+254712345678', token: '123456', type: 'phone_change' })
  })

  it('says when the number is on another account or the code is wrong', async () => {
    fake({ updateError: 'Phone number already registered' })
    expect(await remoteAuth.requestAddPhone('0712 345 678')).toMatchObject({ ok: false, code: 'taken' })
    fake({ verifyError: true })
    expect(await remoteAuth.confirmAddPhone('+254712345678', '000000')).toMatchObject({ ok: false, code: 'wrong' })
    fake({ syncCode: 'phone-taken' })
    expect(await remoteAuth.confirmAddPhone('+254712345678', '123456')).toMatchObject({ ok: false, code: 'phone-taken' })
  })
})
