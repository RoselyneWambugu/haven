import type { Applicant, Res } from '@/api/types'
import { getDb, update } from '@/store/db'
import { supabase } from './client'
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

let phone: string | null = null

/** Step one: a code goes to the applicant's phone. They don't need an Echo account to apply. */
export async function applicantRequestOtp(number: string): Promise<Res> {
  const { error } = await supabase().auth.signInWithOtp({ phone: number, options: { shouldCreateUser: true } })
  if (error) return { ok: false, error: 'We couldn’t send a code. Check the number and try again.', code: 'send' }
  phone = number
  return { ok: true, value: undefined }
}

/** Step two: the code signs them in, and the screen shows where their application stands. Anyone else signed in on this device is signed out. */
export async function applicantVerifyOtp(code: string): Promise<Res<{ therapist: boolean }>> {
  if (!phone) return { ok: false, error: 'Ask for a new code.', code: 'none' }
  const { error } = await supabase().auth.verifyOtp({ phone, token: code.trim(), type: 'sms' })
  if (error) return { ok: false, error: 'That code doesn’t match, or it has expired.', code: 'wrong' }
  stopPolling()
  stopAdminPolling()
  stopPortalPolling()
  update({ signedIn: false, account: null, conversations: [], match: { state: 'idle' }, posts: [], spaces: [], subscription: null, checkout: null, sessions: [], admin: null })
  // Someone who is already a therapist goes straight to the portal.
  if (await syncPortal()) {
    startPortalPolling()
    return { ok: true, value: { therapist: true } }
  }
  await refreshApplication()
  return { ok: true, value: { therapist: false } }
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
