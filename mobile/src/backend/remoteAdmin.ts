import { admin as mockAdmin, seed } from '@/api/admin'
import type { AdminAppeal, AdminCase, AdminState, AdminUser, AuditEntry, CaseAction, HeldPost, Res, StaffAccount, StaffRole } from '@/api/types'
import { now } from '@/lib/clock'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'
import { stopPolling } from './remoteChat'
import { stopPortalPolling } from './remotePortal'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'

interface RemoteAdmin {
  name: string
  role: StaffRole
  staff: { id: string; name: string; role: StaffRole; active: boolean; last_sign_in_at: number | null }[]
  cases: (AdminCase & { openedAtIso?: string })[]
  users: AdminUser[]
  appeals: AdminAppeal[]
  held: HeldPost[]
  therapists: { id: string; name: string; suspended: boolean; paused: boolean }[]
  audit: AuditEntry[]
  revealed: string[]
}

type Reply = { ok: boolean; error?: string; code?: string }

async function call(fn: string, args?: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE }
  return data as Reply
}

const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

function toState(d: RemoteAdmin, prev: AdminState | null): AdminState {
  const base = prev ?? seed()
  const staff: StaffAccount[] = d.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, active: s.active, lastSignInAt: s.last_sign_in_at }))
  const standing: NonNullable<AdminState['therapistStanding']> = {}
  for (const t of d.therapists) if (t.suspended) standing[t.id] = { reason: 'Suspended by the team', by: 'Echo team', at: now() }
  return {
    ...base,
    signedIn: true,
    role: d.role,
    staffName: d.name,
    staff,
    cases: d.cases.map(({ openedAtIso: _iso, ...c }) => c),
    users: d.users,
    appeals: d.appeals,
    audit: d.audit,
    held: d.held,
    revealed: d.revealed.map((k) => `${d.name}|${k}`),
    therapistStanding: standing,
  }
}

let syncing: Promise<boolean> | null = null

/** Brings the dashboard in line with the server. False when this sign-in isn't a staff account. */
export function syncAdmin(): Promise<boolean> {
  if (syncing) return syncing
  syncing = (async () => {
    const { data, error } = await supabase().rpc('admin_state')
    const d = data as ({ ok?: boolean } & Partial<RemoteAdmin>) | null
    if (error || !d) return !!getDb().admin?.signedIn
    if (d.ok !== true || !d.name) return false
    update((s) => ({ admin: toState(d as RemoteAdmin, s.admin ?? null) }))
    if (d.role === 'clinical' || d.role === 'admin') await syncLinks()
    return true
  })().finally(() => {
    syncing = null
  })
  return syncing
}

async function syncLinks(): Promise<void> {
  const { data } = await supabase().rpc('admin_therapist_links')
  const d = data as { ok?: boolean; links?: { id: string; linked: boolean; pending: boolean; tail: string }[] } | null
  if (!d?.ok || !d.links) return
  const links = Object.fromEntries(d.links.map((l) => [l.id, { linked: l.linked, pending: l.pending, tail: l.tail }]))
  update((s) => (s.admin ? { admin: { ...s.admin, therapistLinks: links } } : {}))
}

let timer: ReturnType<typeof setInterval> | null = null

export function startAdminPolling(): void {
  if (timer) return
  timer = setInterval(() => {
    if (!getDb().admin?.signedIn) return stopAdminPolling()
    void syncAdmin()
  }, 5000)
}

export function stopAdminPolling(): void {
  if (timer) clearInterval(timer)
  timer = null
}

let signInPhone: string | null = null

/** Step one of a staff sign-in: a code goes to their phone. */
export async function adminRequestOtp(phone: string): Promise<Res> {
  const { error } = await supabase().auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })
  if (error) return { ok: false, error: 'We couldn’t send a code. Check the number and try again.', code: 'send' }
  signInPhone = phone
  return { ok: true, value: undefined }
}

/** Step two: the code opens the dashboard if the number belongs to a staff member. Any member or therapist session on this device is signed out. */
export async function adminVerifyOtp(code: string): Promise<Res> {
  if (!signInPhone) return { ok: false, error: 'Ask for a new code.', code: 'none' }
  const { error } = await supabase().auth.verifyOtp({ phone: signInPhone, token: code.trim(), type: 'sms' })
  if (error) return { ok: false, error: 'That code doesn’t match, or it has expired.', code: 'wrong' }
  stopPolling()
  stopPortalPolling()
  update({ signedIn: false, account: null, conversations: [], match: { state: 'idle' }, posts: [], spaces: [], subscription: null, checkout: null, sessions: [], portal: null })
  const me = await call('staff_me')
  if (!me.ok || !(await syncAdmin())) {
    await supabase().auth.signOut()
    update({ admin: null })
    return { ok: false, error: 'This number isn’t linked to a staff account. Ask an Admin to link it.', code: 'not-staff' }
  }
  startAdminPolling()
  return { ok: true, value: undefined }
}

/** Opens the dashboard again on start-up if the saved session still belongs to staff. */
export async function restoreAdmin(): Promise<void> {
  if (!getDb().admin?.signedIn) return
  const { data } = await supabase().auth.getSession()
  if (!data.session || !(await syncAdmin())) {
    update((s) => ({ admin: s.admin ? { ...s.admin, signedIn: false } : null }))
    return
  }
  startAdminPolling()
}

/** Runs a change on the server, then refreshes so the screen shows what was recorded. */
async function act(fn: string, args: Record<string, unknown>): Promise<Res> {
  const r = await call(fn, args)
  await syncAdmin()
  return res(r)
}

export const remoteAdmin = {
  ...mockAdmin,

  /** The real sign-in is by phone and code; there is no demo sign-in on the real backend. */
  signIn(): Res {
    return { ok: false, error: 'Sign in with your phone number.' }
  },
  signOut(): void {
    stopAdminPolling()
    update({ admin: null })
    void supabase().auth.signOut()
  },

  /** Cases come from the server, so there is nothing to copy over from the device. */
  syncReports(): void {
    void syncAdmin()
  },
  claim: (id: string) => act('admin_claim', { p_case: id }),
  async view(id: string): Promise<void> {
    await call('admin_view', { p_case: id })
  },
  reveal: (caseId: string, lineId: string) => act('admin_reveal', { p_case: caseId, p_line: lineId }),
  decide: (caseId: string, action: CaseAction, reason: string) => act('admin_decide', { p_case: caseId, p_action: action, p_reason: reason }),

  liftTherapistPause: (reason: string, therapistId?: string) => act('admin_lift_pause', { p_therapist: therapistId ?? '', p_reason: reason }),
  suspendTherapist: (therapistId: string, reason: string) => act('admin_suspend_therapist', { p_therapist: therapistId, p_reason: reason }),
  reinstateTherapist: (therapistId: string, reason: string) => act('admin_reinstate_therapist', { p_therapist: therapistId, p_reason: reason }),

  /** Links a therapist to the phone number they will sign in to the portal with. */
  linkTherapist: (therapistId: string, phone: string) => act('admin_link_therapist', { p_therapist: therapistId, p_phone: phone }),
  unlinkTherapist: (therapistId: string, reason: string) => act('admin_unlink_therapist', { p_therapist: therapistId, p_reason: reason }),

  users(): AdminUser[] {
    return getDb().admin?.users ?? []
  },
  userAction: (userId: string, action: 'restrict' | 'suspend' | 'restore', reason: string) => act('admin_user_action', { p_account: userId, p_action: action, p_reason: reason }),

  appeals(): AdminAppeal[] {
    return getDb().admin?.appeals ?? []
  },
  decideAppeal(id: string, outcome: 'upheld' | 'reduced' | 'overturned', explanation: string): Promise<Res> {
    const ap = getDb().admin?.appeals.find((x) => x.id === id)
    return act('admin_decide_appeal', { p_notice: ap?.noticeId ?? '', p_outcome: outcome, p_explanation: explanation })
  },
  reassignAppeal(): void {},

  exportAudit(): Res<{ csv: string }> {
    const a = getDb().admin
    if (!a || a.role !== 'admin') return { ok: false, error: 'Only an Admin can export the audit log.', code: 'role' }
    const rows = a.audit.map((e) => [new Date(e.at).toISOString(), e.actor, e.role, e.action, e.target, e.reason].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    return { ok: true, value: { csv: ['When,Who,Role,Action,Target,Reason', ...rows].join('\n') } }
  },

  /** A moderator approves or removes a post that was held for review. */
  async reviewPost(postId: string, approve: boolean, reason = ''): Promise<Res> {
    const r = await act('admin_review_post', { p_post: postId, p_approve: approve, p_reason: reason })
    if (!r.ok) showToast(r.error)
    return r
  },
}
