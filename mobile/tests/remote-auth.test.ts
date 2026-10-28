import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteAuth, restoreSession } from '../src/backend/remoteAuth'
import { toAccount, type RemoteAccount } from '../src/backend/map'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const ACCOUNT: RemoteAccount = {
  id: 'u1',
  standing: 'good',
  has_posted_before: false,
  deletion_requested_at: null,
  trusted_device: true,
  shared_device: false,
  mood: null,
  settings: { appLock: true },
  created_at: '2026-10-21T08:00:00Z',
  public: { pen_name: 'QuietPine', avatar: 'moon', languages: ['English'], topics: [], age_band: '25-34', open_to_chats: true, pen_name_changed_at: null },
  private: { full_name: 'Wanjiru Kamau', phone: '+254712345678', email: '', date_of_birth: '1995-05-05', id_verified: false },
  consents: { version: '2026-10', terms: true, privacy: true, guidelines: true, moderation: true, at: '2026-10-21T08:00:00Z' },
  devices: [{ id: 'd1', name: 'This phone', kind: 'phone', approx_place: 'Nairobi', last_active_at: '2026-10-21T08:00:00Z' }],
}

/** A stand-in for the Supabase client that records what the app asked for. */
function fake(opts: { hasAccount?: boolean; goodCode?: string; session?: boolean; rpcs?: Record<string, unknown> } = {}) {
  const calls: { name: string; args?: unknown }[] = []
  const state = { account: opts.hasAccount ? ACCOUNT : null, signedOut: 0, sent: 0 }
  const client = {
    auth: {
      signInWithOtp: async () => ((state.sent += 1), { error: null }),
      verifyOtp: async ({ token }: { token: string }) => ({ error: token === (opts.goodCode ?? '123456') ? null : { message: 'Token has expired or is invalid' } }),
      signOut: async () => ((state.signedOut += 1), { error: null }),
      getSession: async () => ({ data: { session: opts.session ? {} : null } }),
    },
    rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args })
      if (opts.rpcs && name in opts.rpcs) return { data: opts.rpcs[name], error: null }
      if (name === 'my_account') return { data: state.account, error: null }
      if (name === 'trust_device') return { data: { ok: true, device_id: 'd1' }, error: null }
      if (name === 'register_member') {
        state.account = ACCOUNT
        return { data: { ok: true, age_band: '25-34' }, error: null }
      }
      return { data: { ok: true }, error: null }
    },
  }
  setClient(client as unknown as SupabaseClient)
  return { calls, state }
}

const start = (purpose: 'register' | 'login') => {
  if (purpose === 'register') {
    remoteAuth.submitDetails({ fullName: 'Wanjiru Kamau', phone: '0712 345 678', dob: '05/05/1995', email: '' })
    remoteAuth.acceptConsents()
  }
}

beforeEach(() => {
  resetClock()
  update(freshState())
})

describe('mapping the server account', () => {
  it('turns snake_case and ISO times into the app account and keeps local-only fields', () => {
    const a = toAccount(ACCOUNT, null, 'd1')
    expect(a.public.penName).toBe('QuietPine')
    expect(a.private.phone).toBe('+254712345678')
    expect(a.devices[0]).toMatchObject({ id: 'd1', current: true })
    expect(a.settings.appLock).toBe(true)
    expect(a.settings.quickExit).toBe(true) // defaults fill what the server left out
    expect(a.createdAt).toBe(new Date('2026-10-21T08:00:00Z').getTime())
  })
})

describe('codes', () => {
  it('asks the server for a code and keeps no code on the device', async () => {
    const f = fake()
    start('register')
    const r = await remoteAuth.requestOtp('register')
    expect(r.ok).toBe(true)
    expect(f.state.sent).toBe(1)
    expect(getDb().otp?.code).toBe('')
  })

  it('locks after too many wrong codes', async () => {
    fake()
    start('register')
    await remoteAuth.requestOtp('register')
    let last
    for (let i = 0; i < 5; i++) last = await remoteAuth.verifyOtp('000000')
    expect(last).toMatchObject({ ok: false, code: 'locked' })
    expect(await remoteAuth.requestOtp('register')).toMatchObject({ ok: false, code: 'locked' })
  })
})

describe('signing up and signing in', () => {
  it('a new number is sent on to create a profile', async () => {
    fake()
    start('register')
    await remoteAuth.requestOtp('register')
    expect(await remoteAuth.verifyOtp('123456')).toEqual({ ok: true, value: { next: 'create-profile' } })
    expect(getDb().reg?.verified).toBe(true)
  })

  it('registering sends the details to the server and signs the member in', async () => {
    const f = fake()
    start('register')
    await remoteAuth.requestOtp('register')
    await remoteAuth.verifyOtp('123456')
    remoteAuth.saveProfileDraft({ penName: 'QuietPine', avatar: 'moon', languages: ['English'] })
    expect((await remoteAuth.completeRegistration('web')).ok).toBe(true)
    const reg = f.calls.find((c) => c.name === 'register_member')!.args as Record<string, unknown>
    expect(reg).toMatchObject({ p_full_name: 'Wanjiru Kamau', p_date_of_birth: '1995-05-05', p_pen_name: 'QuietPine' })
    expect(getDb().signedIn).toBe(true)
    expect(getDb().account?.public.penName).toBe('QuietPine')
    expect(getDb().account?.devices.find((d) => d.current)?.id).toBe('d1')
    expect(getDb().reg).toBeNull()
  })

  it('shows the server’s reason when it refuses the pen name', async () => {
    fake({ rpcs: { register_member: { ok: false, code: 'taken', error: 'Someone already has that name. Try another.' } } })
    start('register')
    await remoteAuth.requestOtp('register')
    await remoteAuth.verifyOtp('123456')
    remoteAuth.saveProfileDraft({ penName: 'QuietPine', languages: ['English'] })
    expect(await remoteAuth.completeRegistration('web')).toMatchObject({ ok: false, code: 'taken' })
    expect(getDb().signedIn).toBe(false)
  })

  it('logging in with a known number signs in and loads the account', async () => {
    fake({ hasAccount: true })
    await remoteAuth.requestOtp('login', '0712 345 678')
    expect(await remoteAuth.verifyOtp('123456')).toEqual({ ok: true, value: { next: 'trust-device' } })
    expect(getDb().signedIn).toBe(true)
    expect(getDb().account?.private.fullName).toBe('Wanjiru Kamau')
  })

  it('logging in with an unknown number says there is no account and signs the session out', async () => {
    const f = fake()
    await remoteAuth.requestOtp('login', '0712 345 678')
    expect(await remoteAuth.verifyOtp('123456')).toEqual({ ok: true, value: { next: 'no-account' } })
    expect(getDb().signedIn).toBe(false)
    expect(f.state.signedOut).toBe(1)
  })

  it('registering with a number that already has an account does not sign in', async () => {
    fake({ hasAccount: true })
    start('register')
    await remoteAuth.requestOtp('register')
    expect(await remoteAuth.verifyOtp('123456')).toEqual({ ok: true, value: { next: 'already-registered' } })
    expect(getDb().signedIn).toBe(false)
    expect(getDb().account).toBeNull()
  })

  it('logging in cancels a deletion that was waiting', async () => {
    const f = fake({ hasAccount: true })
    f.state.account = { ...ACCOUNT, deletion_requested_at: '2026-10-20T08:00:00Z' }
    await remoteAuth.requestOtp('login', '0712 345 678')
    await remoteAuth.verifyOtp('123456')
    expect(f.calls.some((c) => c.name === 'cancel_account_deletion')).toBe(true)
  })
})

describe('after sign-in', () => {
  async function signedIn() {
    const f = fake({ hasAccount: true })
    await remoteAuth.requestOtp('login', '0712 345 678')
    await remoteAuth.verifyOtp('123456')
    return f
  }

  it('changes show at once and are sent to the server', async () => {
    const f = await signedIn()
    remoteAuth.setAvatar('leaf')
    expect(getDb().account?.public.avatar).toBe('leaf')
    await Promise.resolve()
    expect(f.calls.find((c) => c.name === 'update_profile')?.args).toEqual({ p_avatar: 'leaf' })
  })

  it('puts the screen right when the server refuses a change', async () => {
    const f = await signedIn()
    f.state.account = ACCOUNT
    ;(f as unknown as { calls: unknown[] }).calls.length = 0
    setClient({
      rpc: async (name: string) => (name === 'update_settings' ? { data: { ok: false, code: 'invalid', error: 'That time is not allowed.' }, error: null } : { data: name === 'my_account' ? ACCOUNT : { ok: true }, error: null }),
      auth: {},
    } as unknown as SupabaseClient)
    remoteAuth.setSettings({ lockAfterSeconds: 99999 })
    expect(getDb().account?.settings.lockAfterSeconds).toBe(99999)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(getDb().account?.settings.lockAfterSeconds).toBe(60)
  })

  it('signing out clears the account from the device', async () => {
    await signedIn()
    remoteAuth.signOut()
    expect(getDb().signedIn).toBe(false)
    expect(getDb().account).toBeNull()
  })

  it('a refused pen-name change returns the reason', async () => {
    fake({ hasAccount: true, rpcs: { change_pen_name: { ok: false, code: 'limit', error: 'You can change your pen name again in 12 days.' } } })
    expect(await remoteAuth.changePenName('NewName')).toMatchObject({ ok: false, code: 'limit' })
  })
})

describe('starting the app', () => {
  it('keeps a saved session and refreshes the account', async () => {
    fake({ hasAccount: true, session: true })
    update({ signedIn: true })
    await restoreSession()
    expect(getDb().signedIn).toBe(true)
    expect(getDb().account?.public.penName).toBe('QuietPine')
  })

  it('signs out and clears the cache when the session has ended', async () => {
    fake({ session: false })
    update({ signedIn: true, account: toAccount(ACCOUNT, null, null) })
    await restoreSession()
    expect(getDb().signedIn).toBe(false)
    expect(getDb().account).toBeNull()
  })
})
