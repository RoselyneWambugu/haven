import { auth } from '@/api/auth'
import type { AvatarKind, SignInNext, Res, Settings } from '@/api/types'
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
import { enterAdmin, isStaff, restoreAdmin, stopAdminPolling } from './remoteAdmin'
import { syncHelp } from './remoteHelp'
import * as Linking from 'expo-linking'
import { exchange, openGoogle, takePurpose, webBase, type GooglePurpose } from './remoteGoogle'
import { passwordProblem, validEmail } from '@/lib/password'
import { MEMBERS_ON_WEB } from '@/lib/webMembers'
import { enterPortal, isTherapist, restorePortal, stopPortalPolling } from './remotePortal'

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

  async verifyOtp(input: string): Promise<Res<{ next: 'create-profile' | 'trust-device' | 'reauth-ok' | 'no-account' | 'already-registered' | 'portal' | 'admin' }>> {
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
      // Not a member. A therapist or a staff member who logs in with their number goes to their own place: Echo already knows who they are.
      if (await isTherapist()) {
        const r = await enterPortal('number')
        if (r.ok) return { ok: true, value: { next: 'portal' } }
      } else if (await isStaff()) {
        const r = await enterAdmin('number')
        if (r.ok) return { ok: true, value: { next: 'admin' } }
      }
      await supabase().auth.signOut()
      return { ok: true, value: { next: 'no-account' } }
    }
    await enterAsMember()
    return { ok: true, value: { next: 'trust-device' } }
  },

  /** Opens Google. A member who already has an Echo account is signed in; a new one carries on to registration without a phone number. */
  async signInWithGoogle(purpose: GooglePurpose): Promise<Res<{ next: SignInNext }>> {
    const r = await openGoogle(purpose)
    if (!r.ok) return r
    if (r.value.redirecting) return { ok: true, value: { next: 'redirecting' } }
    return afterSignIn(purpose)
  },

  /** The web page Google sent the person back to. Finishes what signInWithGoogle started before the page left. */
  async finishGoogleRedirect(url: string): Promise<Res<{ next: SignInNext }>> {
    const purpose = await takePurpose()
    // A repeated visit to the same link has nothing left to do.
    if (!purpose) return failure('That sign-in link has already been used.', 'stale')
    const r = await exchange(url)
    if (!r.ok) return r
    return afterSignIn(purpose)
  },

  /** Makes an account with an email and a password. Supabase emails a link to confirm the address; until it is opened there is no session. */
  async signUpWithEmail(email: string, password: string): Promise<Res<{ next: SignInNext | 'check-email' }>> {
    const e = email.trim()
    if (!validEmail(e)) return failure('Enter your email address, like name@example.com.', 'email')
    const problem = passwordProblem(password, e)
    if (problem) return failure(problem, 'password')
    const { data, error } = await supabase().auth.signUp({ email: e, password, options: { emailRedirectTo: `${webBase()}/auth-callback` } })
    if (error) {
      const limited = error.status === 429 || /rate|too many|seconds/i.test(error.message)
      return failure(limited ? 'Too many emails asked for. Wait a few minutes and try again.' : 'We couldn’t create that account. Check the details and try again.', limited ? 'rate' : 'send')
    }
    // With email confirmation off there is a session at once; with it on, the person has to open the link first.
    if (data.session) return afterSignIn('register')
    return { ok: true, value: { next: 'check-email' } }
  },

  async signInWithEmail(email: string, password: string, purpose: 'login' | 'portal' | 'admin' = 'login'): Promise<Res<{ next: SignInNext }>> {
    const e = email.trim()
    if (!validEmail(e) || !password) return failure('Enter your email and password.', 'form')
    const { error } = await supabase().auth.signInWithPassword({ email: e, password })
    if (error) {
      if (/confirm/i.test(error.message)) return failure('Confirm your email first. We sent you a link when you signed up.', 'unconfirmed')
      if (error.status === 429 || /rate|too many/i.test(error.message)) return failure('Too many tries. Wait a few minutes and try again.', 'rate')
      return failure('That email and password don’t match.', 'wrong')
    }
    return afterSignIn(purpose)
  },

  /** Always says the same thing, so this can't be used to find out who has an account. */
  async requestPasswordReset(email: string): Promise<Res> {
    const e = email.trim()
    if (!validEmail(e)) return failure('Enter your email address, like name@example.com.', 'email')
    const { error } = await supabase().auth.resetPasswordForEmail(e, { redirectTo: `${webBase()}/auth-callback` })
    if (error && (error.status === 429 || /rate|too many|seconds/i.test(error.message))) return failure('Too many emails asked for. Wait a few minutes and try again.', 'rate')
    return { ok: true, value: undefined }
  },

  /** True while a reset link has signed the person in and they have not yet chosen the new password. */
  async hasRecoverySession(): Promise<boolean> {
    return !!(await supabase().auth.getSession()).data.session
  },

  /** Saves the new password, then carries on exactly as a log in would: into the account, or on to registration. */
  async setNewPassword(password: string): Promise<Res<{ next: SignInNext }>> {
    const user = (await supabase().auth.getUser()).data.user
    const problem = passwordProblem(password, user?.email ?? '')
    if (problem) return failure(problem, 'password')
    const { error } = await supabase().auth.updateUser({ password })
    if (error) {
      return failure(/same|different/i.test(error.message) ? 'Choose a password you haven’t used before.' : 'We couldn’t save that password. Ask for a new link and try again.', 'save')
    }
    return afterSignIn('login')
  },

  /** The link in the email: a token in the address, opened on any device. Recovery goes to the new-password page; a confirmation carries on to sign-in or registration. */
  async finishEmailLink(url: string): Promise<Res<{ next: SignInNext | 'reset-password' }>> {
    const q = Linking.parse(url).queryParams ?? {}
    const hash = typeof q.token_hash === 'string' ? q.token_hash : null
    const type = q.type === 'recovery' ? 'recovery' : q.type === 'signup' || q.type === 'email' ? 'email' : q.type === 'email_change' ? 'email_change' : null
    if (!hash || !type) return failure('That link isn’t valid. Ask for a new one.', 'link')
    const { error } = await supabase().auth.verifyOtp({ token_hash: hash, type })
    if (error) return failure('That link has expired or was already used. Ask for a new one.', 'link')
    if (type === 'recovery') return { ok: true, value: { next: 'reset-password' } }
    // A confirmed new email on an account that is signed in: the password was added to it.
    if (type === 'email_change') {
      await syncMethods()
      return { ok: true, value: { next: 'linked' } }
    }
    return afterSignIn('register')
  },

  /** Opens the private profile again for someone who signs in with a password. */
  async reauthWithPassword(password: string): Promise<Res> {
    const user = (await supabase().auth.getUser()).data.user
    if (!user?.email || user.id !== getDb().account?.id) return failure('Sign in again first.', 'mismatch')
    const { error } = await supabase().auth.signInWithPassword({ email: user.email, password })
    if (error) return failure('That password doesn’t match.', 'wrong')
    update({ reauthUntil: now() + 5 * MIN })
    return { ok: true, value: undefined }
  },

  /** The ways the person who is signed in can sign in, read from Supabase. Works for members, therapists and staff alike. Null when nobody is signed in. */
  async signInMethods(): Promise<{ phone: string; email: string; google: boolean; password: boolean } | null> {
    const u = (await supabase().auth.getUser()).data.user
    if (!u) return null
    const ids = u.identities ?? []
    return {
      phone: u.phone ? (u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : '',
      email: u.email ?? '',
      google: ids.some((i) => i.provider === 'google'),
      password: ids.some((i) => i.provider === 'email'),
    }
  },

  /** Adds Google to the account that is signed in, so the same person doesn't end up with two accounts. */
  async linkGoogle(): Promise<Res<{ next: SignInNext }>> {
    const r = await openGoogle('link')
    if (!r.ok) return r
    if (r.value.redirecting) return { ok: true, value: { next: 'redirecting' } }
    return afterSignIn('link')
  },

  /** Adds an email and password to the account that is signed in. Supabase emails a link; opening it confirms the email and finishes the link. */
  async addEmailPassword(email: string, password: string): Promise<Res> {
    const e = email.trim()
    if (!validEmail(e)) return failure('Enter your email address, like name@example.com.', 'email')
    const problem = passwordProblem(password, e)
    if (problem) return failure(problem, 'password')
    const { error } = await supabase().auth.updateUser({ email: e, password }, { emailRedirectTo: `${webBase()}/auth-callback` })
    if (error) {
      const limited = error.status === 429 || /rate|too many|seconds/i.test(error.message)
      const used = /already|registered/i.test(error.message)
      return failure(limited ? 'Too many emails asked for. Wait a few minutes and try again.' : used ? 'That email is already used by another Echo account.' : 'We couldn’t add that email. Check it and try again.', limited ? 'rate' : used ? 'taken' : 'save')
    }
    return { ok: true, value: undefined }
  },

  /** Adds a phone number to an account that signs in another way. A code is texted to the number. */
  async requestAddPhone(phoneInput: string): Promise<Res<{ phone: string }>> {
    const phone = normaliseKenyanPhone(phoneInput)
    if (!phone) return failure('Enter a Kenyan mobile number, like 0712 345 678.', 'phone')
    const { error } = await supabase().auth.updateUser({ phone })
    if (error) {
      const limited = error.status === 429 || /rate|too many|seconds/i.test(error.message)
      const used = /already|registered/i.test(error.message)
      return failure(limited ? 'Too many codes asked for. Wait a minute and try again.' : used ? 'That number is already on another Echo account.' : 'We couldn’t send a code. Check the number and try again.', limited ? 'rate' : used ? 'taken' : 'send')
    }
    return { ok: true, value: { phone } }
  },

  async confirmAddPhone(phone: string, code: string): Promise<Res> {
    const { error } = await supabase().auth.verifyOtp({ phone, token: code.trim(), type: 'phone_change' })
    if (error) return failure('That code doesn’t match, or it has expired.', 'wrong')
    const r = await rpc('sync_sign_in_methods')
    if (!r.ok) return failure(r.error, r.code)
    await loadAccount()
    return { ok: true, value: undefined }
  },

  /** A Google registration has no phone to check, so the details step skips it. Everything else is checked as usual. */
  submitDetails(input: { fullName: string; phone: string; dob: string; email: string }): Res<{ phone: string }> {
    if (!getDb().reg?.verified) return auth.submitDetails(input)
    const r = auth.submitDetails({ ...input, phone: '0700000000' })
    update((s) => (s.reg ? { reg: { ...s.reg, phone: '', verified: true } } : {}))
    return r.ok ? { ok: true, value: { phone: '' } } : r
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

/** Signs the member in on this device once the server has their account. Shared by the phone code and Google. */
async function enterAsMember(): Promise<void> {
  stopPortalPolling()
  stopAdminPolling()
  update((s) => ({ signedIn: true, locked: false, portal: s.portal ? { ...s.portal, signedIn: false } : null, admin: s.admin ? { ...s.admin, signedIn: false } : null }))
  startPolling()
  if (getDb().account?.deletionRequestedAt) {
    await rpc('cancel_account_deletion')
    await loadAccount()
    showToast('Welcome back. Your account deletion was cancelled.')
  }
}

/** After a sign-in method is added: copy the new email or phone into Echo's private record, then refresh the account. */
async function syncMethods(): Promise<void> {
  await rpc('sync_sign_in_methods')
  await loadAccount()
}

/** Google has confirmed who this is. Decide where they go: into their account, a fresh private-profile check, or registration. */
async function afterSignIn(purpose: GooglePurpose | 'portal' | 'admin'): Promise<Res<{ next: SignInNext }>> {
  const user = (await supabase().auth.getUser()).data.user
  if (!user) return failure('Google sign-in didn’t finish. Try again.', 'google')
  if (purpose === 'link') {
    // Google was added to the account that is signed in. Copy the new email into Echo's record and refresh.
    await syncMethods()
    return { ok: true, value: { next: 'linked' } }
  }
  if (purpose === 'reauth') {
    if (user.id !== getDb().account?.id) return failure('That isn’t the Google account on this Echo account.', 'mismatch')
    update({ reauthUntil: now() + 5 * MIN })
    return { ok: true, value: { next: 'reauth-ok' } }
  }
  // The therapist portal and the staff dashboard have their own sign-in pages: the person must really be a therapist or staff.
  if (purpose === 'portal') {
    const r = await enterPortal('email')
    return r.ok ? { ok: true, value: { next: 'portal' } } : r
  }
  if (purpose === 'admin') {
    const r = await enterAdmin('email')
    return r.ok ? { ok: true, value: { next: 'admin' } } : r
  }
  const hasAccount = await loadAccount()
  // On the live website members have no screens. Whoever this is, they carry on in the mobile app, so no member session is kept here.
  if (!MEMBERS_ON_WEB && !(await isTherapist()) && !(await isStaff())) {
    await supabase().auth.signOut()
    update({ account: null })
    return { ok: true, value: { next: 'mobile-app' } }
  }
  if (hasAccount && MEMBERS_ON_WEB) {
    await enterAsMember()
    return { ok: true, value: { next: 'trust-device' } }
  }
  // No member account. A therapist or staff member who signed in here is taken to their own place instead of being asked to register.
  if (await isTherapist()) {
    const r = await enterPortal('email')
    if (r.ok) return { ok: true, value: { next: 'portal' } }
  } else if (await isStaff()) {
    const r = await enterAdmin('email')
    if (r.ok) return { ok: true, value: { next: 'admin' } }
  }
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string }
  update((s) => ({
    reg: { ...(s.reg ?? emptyRegistration()), email: user.email ?? '', fullName: s.reg?.fullName || String(meta.full_name ?? meta.name ?? ''), phone: '', verified: true },
  }))
  return { ok: true, value: { next: getDb().reg?.consentsAcceptedAt ? 'register' : 'consent' } }
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
  void syncHelp()
  await restorePortal()
  await restoreAdmin()
  const { data } = await supabase().auth.getSession()
  if (!data.session) {
    if (getDb().signedIn) update({ signedIn: false, account: null })
    return
  }
  // Offline with a saved session: keep what is cached rather than signing the member out.
  await loadAccount()
}
