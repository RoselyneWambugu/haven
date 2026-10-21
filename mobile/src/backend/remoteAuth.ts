import { auth } from '@/api/auth'
import type { AvatarKind, Res, Settings } from '@/api/types'
import { CONFIG } from '@/data/config'
import { now } from '@/lib/clock'
import { ageBand, ageOn, normaliseKenyanPhone } from '@/lib/identity'
import { validatePenName } from '@/lib/safety'
import { emptyRegistration, getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'
import { toAccount, type RemoteAccount } from './map'
import { startPolling, stopPolling } from './remoteChat'
import { clearTherapistCache } from './remoteTherapists'
import { restorePortal, stopPortalPolling } from './remotePortal'

const MIN = 60_000

/** What every server function returns when it refuses. */
interface Refusal { ok: false; code: string; error: string }
type Reply = { ok: true; [k: string]: unknown } | Refusal

const failure = (error: string, code?: string): Res<never> => ({ ok: false, error, code })

/** Calls a server function and turns a transport error into a plain message. */
async function rpc(name: string, args?: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) return { ok: false, code: 'network', error: 'We couldn’t reach Echo. Check your connection and try again.' }
  return (data ?? { ok: true }) as Reply
}

function done(r: Reply): Res {
  return r.ok ? { ok: true, value: undefined } : failure(r.error, r.code)
}

/** Fetches the signed-in member's account and keeps it on the device as a cache. Returns false when there is none. */
export async function loadAccount(): Promise<boolean> {
  const { data, error } = await supabase().rpc('my_account')
  if (error || !data) return false
  const prev = getDb().account
  const current = prev?.devices.find((d) => d.current)?.id ?? null
  update({ account: toAccount(data as RemoteAccount, prev, current) })
  return true
}

/** Refetches after a change the server refused, so the screen shows the truth. */
async function resync(message?: string): Promise<void> {
  if (message) showToast(message)
  await loadAccount()
}

/** Runs a change on the server after the screen has already shown it. If the server says no, the screen is put right. */
function background(call: Promise<Reply>): void {
  void call.then((r) => (r.ok ? undefined : resync(r.error)))
}

function phoneFor(purpose: 'register' | 'login' | 'reauth', input?: string): string | null {
  const db = getDb()
  if (purpose === 'register') return db.reg?.phone ?? null
  if (purpose === 'reauth') return db.account?.private.phone ?? null
  return normaliseKenyanPhone(input ?? '')
}

export const remoteAuth = {
  ...auth,

  async requestOtp(purpose: 'register' | 'login' | 'reauth', phoneInput?: string): Promise<Res<{ demoCode: string; phone: string }>> {
    const db = getDb()
    const phone = phoneFor(purpose, phoneInput)
    if (!phone) return failure('Enter a Kenyan mobile number, like 0712 345 678.', 'phone')
    const prev = db.otp
    if (prev && prev.phone === phone && prev.lockedUntil && prev.lockedUntil > now()) {
      return failure(`Too many tries. You can try again in ${Math.ceil((prev.lockedUntil - now()) / MIN)} minutes.`, 'locked')
    }
    // Logging in with a number that has no account sends a code anyway, so this can't be used to find out who is on Echo.
    const { error } = await supabase().auth.signInWithOtp({ phone, options: { shouldCreateUser: true } })
    if (error) {
      const limited = error.status === 429 || /rate|too many|seconds/i.test(error.message)
      return failure(limited ? 'Too many codes asked for. Wait a minute and try again.' : 'We couldn’t send a code. Check the number and try again.', limited ? 'rate' : 'send')
    }
    update({ otp: { phone, code: '', purpose, expiresAt: now() + 10 * MIN, attempts: 0, lockedUntil: null } })
    return { ok: true, value: { demoCode: '', phone } }
  },

  async verifyOtp(input: string): Promise<Res<{ next: 'create-profile' | 'trust-device' | 'reauth-ok' | 'no-account' | 'already-registered' }>> {
    const otp = getDb().otp
    if (!otp) return failure('Ask for a new code.', 'none')
    if (otp.lockedUntil && otp.lockedUntil > now()) {
      return failure(`Too many tries. You can try again in ${Math.ceil((otp.lockedUntil - now()) / MIN)} minutes.`, 'locked')
    }
    const { error } = await supabase().auth.verifyOtp({ phone: otp.phone, token: input.trim(), type: 'sms' })
    if (error) {
      const attempts = otp.attempts + 1
      if (attempts >= CONFIG.otpMaxAttempts) {
        update({ otp: { ...otp, attempts, lockedUntil: now() + CONFIG.otpLockMinutes * MIN } })
        return failure(`Too many tries. You can try again in ${CONFIG.otpLockMinutes} minutes.`, 'locked')
      }
      update({ otp: { ...otp, attempts } })
      const left = CONFIG.otpMaxAttempts - attempts
      return failure(`That code doesn’t match, or it has expired. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'wrong')
    }
    update({ otp: null })
    if (otp.purpose === 'reauth') {
      update({ reauthUntil: now() + 5 * MIN })
      return { ok: true, value: { next: 'reauth-ok' } }
    }
    const has = await loadAccount()
    if (otp.purpose === 'register') {
      if (has) {
        await supabase().auth.signOut()
        update({ account: null })
        return { ok: true, value: { next: 'already-registered' } }
      }
      update((s) => ({ reg: { ...(s.reg ?? emptyRegistration()), verified: true } }))
      return { ok: true, value: { next: 'create-profile' } }
    }
    if (!has) {
      await supabase().auth.signOut()
      return { ok: true, value: { next: 'no-account' } }
    }
    stopPortalPolling()
    update((s) => ({ signedIn: true, locked: false, portal: s.portal ? { ...s.portal, signedIn: false } : null }))
    startPolling()
    if (getDb().account?.deletionRequestedAt) {
      await rpc('cancel_account_deletion')
      await loadAccount()
      showToast('Welcome back. Your account deletion was cancelled.')
    }
    return { ok: true, value: { next: 'trust-device' } }
  },

  /** Local rules first (fast, and they know common names), then the server (who has the name). */
  async checkPenName(name: string): Promise<Res> {
    const v = validatePenName(name)
    if (!v.ok) return failure(v.message, v.problem)
    return done(await rpc('check_pen_name', { p_name: name }))
  },

  async completeRegistration(platform: string): Promise<Res> {
    const reg = getDb().reg
    if (!reg || !reg.verified || !reg.consentsAcceptedAt) return failure('Please start again.', 'incomplete')
    if (!ageBand(ageOn(new Date(reg.dob), new Date(now())))) return failure('Echo is for people 18 and over.', 'under-18')
    const r = await rpc('register_member', {
      p_full_name: reg.fullName,
      p_date_of_birth: reg.dob.slice(0, 10),
      p_email: reg.email || null,
      p_pen_name: reg.penName,
      p_avatar: reg.avatar,
      p_languages: reg.languages,
      p_topics: reg.topics,
      p_consent_version: '2026-10',
    })
    if (!r.ok) return failure(r.error, r.code)
    // The phone you registered on is your own phone, with app lock left off until you turn it on.
    const t = await rpc('trust_device', { p_own: true, p_name: platform === 'web' ? 'This browser' : 'This phone', p_kind: platform === 'web' ? 'web' : 'phone', p_place: 'Nairobi' })
    if (t.ok) await rpc('update_settings', { p_patch: { appLock: false } })
    await loadAccount()
    markCurrent(t.ok ? String(t.device_id) : null)
    update({ signedIn: true, locked: false, reg: null, otp: null })
    startPolling()
    return { ok: true, value: undefined }
  },

  async trustDevice(own: boolean, platform: string): Promise<void> {
    const t = await rpc('trust_device', { p_own: own, p_name: platform === 'web' ? 'This browser' : 'This phone', p_kind: platform === 'web' ? 'web' : 'phone', p_place: 'Nairobi' })
    await loadAccount()
    markCurrent(t.ok ? String(t.device_id) : null)
  },

  signOut(): void {
    auth.signOut()
    stopPolling()
    clearTherapistCache()
    // What was fetched for this member must not stay on the device.
    update({ account: null, conversations: [], match: { state: 'idle' }, posts: [], spaces: [], subscription: null, checkout: null, sessions: [] })
    void supabase().auth.signOut()
  },

  async changePenName(name: string): Promise<Res> {
    const r = await rpc('change_pen_name', { p_name: name })
    if (r.ok) await loadAccount()
    return done(r)
  },

  setAvatar(avatar: AvatarKind): void {
    auth.setAvatar(avatar)
    background(rpc('update_profile', { p_avatar: avatar }))
  },

  setLanguages(languages: string[]): Res {
    const r = auth.setLanguages(languages)
    if (r.ok) background(rpc('update_profile', { p_languages: languages }))
    return r
  },

  setTopics(topics: string[]): void {
    auth.setTopics(topics)
    background(rpc('update_profile', { p_topics: topics }))
  },

  setSettings(patch: Partial<Settings>): void {
    auth.setSettings(patch)
    background(rpc('update_settings', { p_patch: patch }))
  },

  setMood(value: 1 | 2 | 3 | 4 | 5): void {
    auth.setMood(value)
    background(rpc('set_mood', { p_value: value }))
  },
}

/** The server doesn't know which device is this one, so the app remembers it. */
function markCurrent(id: string | null): void {
  if (!id) return
  const a = getDb().account
  if (a) update({ account: { ...a, devices: a.devices.map((d) => ({ ...d, current: d.id === id })) } })
}

/** The account actions that need the server. Each runs the on-device change first so the screen answers at once. */
export const remoteAccountActions = {
  revokeDevice: (id: string) => background(rpc('revoke_device', { p_device_id: id })),
  requestDeletion: () => background(rpc('request_account_deletion')),
}

/** On start-up: keep the signed-in member's session, or clear what was cached if the session has ended. */
export async function restoreSession(): Promise<void> {
  await restorePortal()
  const { data } = await supabase().auth.getSession()
  if (!data.session) {
    if (getDb().signedIn) update({ signedIn: false, account: null })
    return
  }
  // Offline with a saved session: keep what is cached rather than signing the member out.
  await loadAccount()
}
