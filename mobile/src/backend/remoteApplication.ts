import type { Applicant, Res } from '@/api/types'
import { getDb, update } from '@/store/db'
import { passwordProblem, validEmail } from '@/lib/password'
import { supabase } from './client'
import { webBase } from './remoteGoogle'
import { stopAdminPolling } from './remoteAdmin'
import { stopPolling } from './remoteChat'
import { startPortalPolling, stopPortalPolling, syncPortal } from './remotePortal'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }
type AppState = NonNullable<ReturnType<typeof getDb>['application']>

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}

let pending: { email: string; password: string } | null = null
export const pendingApplicant = (): { email: string } | null => (pending ? { email: pending.email } : null)

/** Applicants are signed in as nobody else: whatever else was signed in on this device is cleared, then a therapist goes to the portal. */
export async function enterApplicantSession(): Promise<Res<{ therapist: boolean }>> {
  stopPolling()
  stopAdminPolling()
  stopPortalPolling()
  update({ signedIn: false, account: null, conversations: [], match: { state: 'idle' }, posts: [], spaces: [], subscription: null, checkout: null, sessions: [], admin: null, signupFor: null })
  pending = null
  // Someone who is already a therapist goes straight to the portal.
  if (await syncPortal()) {
    startPortalPolling()
    return { ok: true, value: { therapist: true } }
  }
  await refreshApplication()
  return { ok: true, value: { therapist: false } }
}

/**
 * Step 1 of 4: make a sign-in with an email and a password. Supabase emails a link to confirm the address. Applicants sign up with an email only;
 * they don't need an Echo account to apply. With email confirmation switched off there is a session at once.
 */
export async function applicantSignUp(email: string, password: string): Promise<Res<{ next: 'check-email' | 'in'; therapist?: boolean }>> {
  const e = email.trim()
  if (!validEmail(e)) return { ok: false, error: 'Enter your email address, like name@example.com.', code: 'email' }
  const problem = passwordProblem(password, e)
  if (problem) return { ok: false, error: problem, code: 'password' }
  update({ signupFor: 'therapist' })
  const { data, error } = await supabase().auth.signUp({ email: e, password, options: { emailRedirectTo: `${webBase()}/auth-callback` } })
  if (error) {
    const limited = error.status === 429 || /rate|too many|seconds/i.test(error.message)
    return { ok: false, error: limited ? 'Too many emails asked for. Wait a few minutes and try again.' : 'We couldn’t create that sign-in. Check the details and try again.', code: limited ? 'rate' : 'send' }
  }
  if (data.session) {
    const r = await enterApplicantSession()
    return r.ok ? { ok: true, value: { next: 'in', therapist: r.value.therapist } } : r
  }
  pending = { email: e, password }
  return { ok: true, value: { next: 'check-email' } }
}

/** Sends the confirmation email again. */
export async function applicantResend(): Promise<Res> {
  if (!pending) return { ok: false, error: 'Start again from the beginning.', code: 'none' }
  const { error } = await supabase().auth.resend({ type: 'signup', email: pending.email, options: { emailRedirectTo: `${webBase()}/auth-callback` } })
  if (error) return { ok: false, error: 'We couldn’t send it again. Wait a minute and try again.', code: 'send' }
  return { ok: true, value: undefined }
}

/** "I've confirmed it", or logging back in to an application already started: signs in with the email and password. */
export async function applicantSignIn(email?: string, password?: string): Promise<Res<{ therapist: boolean }>> {
  const e = (email ?? pending?.email ?? '').trim()
  const pw = password ?? pending?.password ?? ''
  if (!validEmail(e) || !pw) return { ok: false, error: 'Enter your email and password.', code: 'form' }
  const { error } = await supabase().auth.signInWithPassword({ email: e, password: pw })
  if (error) {
    if (/confirm/i.test(error.message)) return { ok: false, error: 'We can’t see it confirmed yet. Open the link in the email, then try again.', code: 'unconfirmed' }
    if (error.status === 429 || /rate|too many/i.test(error.message)) return { ok: false, error: 'Too many tries. Wait a few minutes and try again.', code: 'rate' }
    return { ok: false, error: 'That email and password don’t match.', code: 'wrong' }
  }
  update({ signupFor: 'therapist' })
  return enterApplicantSession()
}

export async function refreshApplication(): Promise<void> {
  const d = await call<Reply & Partial<AppState>>('my_application')
  if (!d.ok || !d.status) return
  update({ application: { status: d.status, message: d.message ?? '', name: d.name ?? '' } })
}

export async function submitApplication(input: { name: string; title: string; gender: 'woman' | 'man'; licenceNumber: string; licenceExpiry: string; consentPublic: boolean; consentConduct: boolean }): Promise<Res> {
  const r = await call('submit_application', {
    p_name: input.name, p_title: input.title, p_gender: input.gender, p_licence_number: input.licenceNumber, p_licence_expiry: input.licenceExpiry,
    p_consent_public: input.consentPublic, p_consent_conduct: input.consentConduct,
  })
  if (!r.ok) return { ok: false, error: r.error ?? OFFLINE, code: r.code }
  await refreshApplication()
  return { ok: true, value: undefined }
}

/** An approved applicant opens the portal with the sign-in they already have. */
export async function openPortalAfterApproval(): Promise<boolean> {
  if (!(await syncPortal())) return false
  startPortalPolling()
  return true
}

export const parseExpiry = (text: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(text.trim()) && !Number.isNaN(Date.parse(text.trim())) ? text.trim() : null)

export type { Applicant }
