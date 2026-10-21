import { admin as mockAdmin, seed } from '@/api/admin'
import { team as mockTeam } from '@/api/team'
import type { AdminRefund, Applicant, Exposure, RotaWeek, WellbeingCfg, AdminAppeal, AdminCase, AdminState, AdminUser, AuditEntry, BreakGlassRequest, CaseAction, HeldPost, Res, StaffAccount, StaffRole } from '@/api/types'
import { now } from '@/lib/clock'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'
import { stopPolling } from './remoteChat'
import { syncAdminConfig } from './remoteConfig'
import { syncStaffGroups } from './remoteGroups'
import { syncFeedback } from './remoteFeedback'
import { syncStaffHelp } from './remoteHelp'
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
    await Promise.all([syncPolicy(), syncBreakGlass(), syncWellbeing(), syncBilling(), syncStaffHelp()])
    if (d.role === 'moderator' || d.role === 'clinical' || d.role === 'admin') await syncStaffGroups()
    if (d.role === 'clinical' || d.role === 'admin') await Promise.all([syncLinks(), syncApplicants()])
    if (d.role === 'admin') await Promise.all([syncInvites(), syncAdminConfig()])
    if (d.role === 'admin' || d.role === 'billing') await syncFeedback()
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

async function syncPolicy(): Promise<void> {
  const { data } = await supabase().rpc('admin_policy')
  const d = data as { ok?: boolean; policy?: AdminState['policy']; pending?: { id: string; policy: AdminState['policy']; requestedBy: string; mine: boolean } | null } | null
  if (!d?.ok || !d.policy) return
  update((s) => (s.admin ? { admin: { ...s.admin, policy: d.policy!, policyChange: d.pending ? { policy: d.pending.policy, requestedBy: d.pending.requestedBy, approvals: [], id: d.pending.id, mine: d.pending.mine } : null } } : {}))
}

async function syncWellbeing(): Promise<void> {
  const { data } = await supabase().rpc('admin_wellbeing')
  const d = data as { ok?: boolean; cfg?: WellbeingCfg; exposure?: Exposure; rota?: RotaWeek[] } | null
  if (!d?.ok || !d.cfg || !d.exposure) return
  update((s) => (s.admin ? { admin: { ...s.admin, wellbeing: d.cfg!, exposure: { ...s.admin.exposure, [s.admin.staffName]: d.exposure! }, rota: d.rota ?? [] } } : {}))
}

async function syncBilling(): Promise<void> {
  const { data } = await supabase().rpc('admin_billing')
  const d = data as { ok?: boolean; refunds?: AdminRefund[]; unmatched?: number; failed?: number } | null
  if (!d?.ok) return
  update((s) => (s.admin ? { admin: { ...s.admin, refunds: d.refunds ?? [], unmatchedPayments: d.unmatched ?? 0, failedPayments: d.failed ?? 0 } } : {}))
}

async function syncApplicants(): Promise<void> {
  const { data } = await supabase().rpc('admin_applicants')
  const d = data as { ok?: boolean; applicants?: Applicant[] } | null
  if (!d?.ok || !d.applicants) return
  update((s) => (s.admin ? { admin: { ...s.admin, applicants: d.applicants! } } : {}))
}

async function syncBreakGlass(): Promise<void> {
  const { data } = await supabase().rpc('admin_break_glass')
  const d = data as { ok?: boolean; requests?: BreakGlassRequest[] } | null
  if (!d?.ok || !d.requests) return
  update((s) => (s.admin ? { admin: { ...s.admin, breakGlass: d.requests! } } : {}))
}

async function syncInvites(): Promise<void> {
  const { data } = await supabase().rpc('admin_staff_invites')
  const d = data as { ok?: boolean; invites?: NonNullable<AdminState['staffInvites']>; heavy?: Record<string, boolean>; pending?: AdminState['staffPending'] } | null
  if (!d?.ok) return
  update((s) => (s.admin ? { admin: { ...s.admin, staffInvites: d.invites ?? [], heavy: d.heavy ?? {}, staffPending: d.pending ?? null } } : {}))
}

/** Fetches the analytics in one reply. The module asks when it opens, because the figures are the heaviest the server works out. */
export async function syncAnalytics(): Promise<boolean> {
  const { data } = await supabase().rpc('admin_analytics')
  const d = data as ({ ok?: boolean } & NonNullable<AdminState['analytics']>) | null
  if (!d?.ok) return false
  update((s) => (s.admin ? { admin: { ...s.admin, analytics: { days: d.days, cohorts: d.cohorts, who: d.who, reviewMinutes: d.reviewMinutes } } } : {}))
  return true
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
    // No Admin exists yet: keep the sign-in so this person can finish setup with the one-time code.
    if (me.code === 'not-staff' && (await setupOpen())) return { ok: false, error: 'Setup is open. Enter your name and the setup code.', code: 'setup' }
    await supabase().auth.signOut()
    update({ admin: null })
    return { ok: false, error: 'This number isn’t linked to a staff account. Ask an Admin to link it.', code: 'not-staff' }
  }
  startAdminPolling()
  return { ok: true, value: undefined }
}

async function setupOpen(): Promise<boolean> {
  const { data } = await supabase().rpc('setup_open')
  return (data as { open?: boolean } | null)?.open === true
}

/** The first Admin: while nobody is an Admin, the one-time setup code makes the person signed in one. */
export async function claimFirstAdmin(name: string, code: string): Promise<Res> {
  const r = await call('claim_first_admin', { p_name: name, p_code: code })
  if (!r.ok) {
    if (r.code === 'closed' || r.code === 'locked') await supabase().auth.signOut()
    return res(r)
  }
  await call('staff_me')
  if (!(await syncAdmin())) return { ok: false, error: OFFLINE }
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

/** A team change: it waits for a second Admin unless there is no other Admin to ask. */
async function proposal(fn: string, args: Record<string, unknown>): Promise<Res<{ proposed: boolean }>> {
  const r = (await call(fn, args)) as Reply & { proposed?: boolean }
  await syncAdmin()
  return r.ok ? { ok: true, value: { proposed: r.proposed === true } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
}

/** Reviewer wellbeing and the heavy-queue rota, kept on the server. Team changes themselves are in `remoteAdmin`. */
export const remoteTeam = {
  ...mockTeam,
  setWellbeing: (cfg: WellbeingCfg) => act('admin_set_wellbeing', { p_daily: cfg.dailyLimit, p_every: cfg.breakEvery, p_minutes: cfg.breakMinutes }),
  startBreak: () => act('admin_start_break', {}),
  endBreak(): void {
    void act('admin_end_break', {})
  },
  ensureRota(): void {
    void call('admin_ensure_rota').then(() => syncAdmin())
  },
  setRota: (weekStart: number, heavy: string[]) => act('admin_set_rota', { p_week: weekStart, p_names: heavy }),
  handOn: (caseId: string) => act('admin_hand_on', { p_case: caseId }),
  askForSupport(): void {
    void call('admin_ask_support')
  },
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

  /** Adds a person to the team by phone number. They become staff when that number signs in. */
  addStaff: (name: string, role: StaffRole, phone: string) => proposal('admin_add_staff', { p_name: name, p_role: role, p_phone: phone }),
  setStaff: (accountId: string, change: { role?: StaffRole; active?: boolean; heavy?: boolean }) =>
    proposal('admin_set_staff', { p_account: accountId, p_role: change.role ?? null, p_active: change.active ?? null, p_heavy: change.heavy ?? null }),
  /** A second Admin approves or declines the change that is waiting. */
  decideStaffChange: (id: string, approve: boolean) => act('admin_decide_staff_change', { p_id: id, p_approve: approve }),
  withdrawStaffChange: (id: string) => act('admin_withdraw_staff_change', { p_id: id }),
  cancelInvite: (name: string) => act('admin_cancel_invite', { p_name: name }),

  // --- strike policy, approved by a second Admin ---
  async proposePolicy(policy: AdminState['policy']): Promise<Res<{ proposed: boolean }>> {
    const r = (await call('admin_propose_policy', { p_expiry_days: policy.expiryDays, p_restriction_hours: policy.restrictionHours })) as Reply & { proposed?: boolean }
    await syncAdmin()
    return r.ok ? { ok: true, value: { proposed: r.proposed === true } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },
  approvePolicy: () => act('admin_decide_policy', { p_id: getDb().admin?.policyChange?.id ?? '', p_approve: true }),
  declinePolicy: () => act('admin_decide_policy', { p_id: getDb().admin?.policyChange?.id ?? '', p_approve: false }),
  async cancelPolicy(): Promise<void> {
    await act('admin_withdraw_policy', { p_id: getDb().admin?.policyChange?.id ?? '' })
  },

  // --- break-glass: a clinical reviewer approves, the requester opens the details for 30 minutes ---
  async requestBreakGlass(caseId: string, input: { reasonCode: BreakGlassRequest['reasonCode']; justification: string }): Promise<Res<{ id: string }>> {
    const r = (await call('admin_request_break_glass', { p_case: caseId, p_reason: input.reasonCode, p_justification: input.justification })) as Reply & { id?: string }
    await syncAdmin()
    return r.ok ? { ok: true, value: { id: r.id ?? '' } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },
  decideBreakGlass: (id: string, approve: boolean) => act('admin_decide_break_glass', { p_id: id, p_approve: approve }),
  async privateProfile(requestId: string): Promise<{ name: string; phone: string; location: string; minutesLeft: number } | null> {
    const { data } = await supabase().rpc('admin_private_profile', { p_id: requestId })
    const d = data as ({ ok?: boolean } & { name?: string; phone?: string; location?: string; minutesLeft?: number }) | null
    if (!d?.ok) {
      await syncAdmin()
      return null
    }
    return { name: d.name ?? '', phone: d.phone ?? '', location: d.location ?? '', minutesLeft: d.minutesLeft ?? 0 }
  },

  applicants(): Applicant[] {
    return getDb().admin?.applicants ?? []
  },
  verify: (id: string, decision: 'approved' | 'info' | 'rejected', message: string, checklist: Applicant['checklist']) =>
    act('admin_verify_applicant', { p_id: id, p_decision: decision, p_message: message, p_checklist: checklist }),
  decideRefund: (id: string, approve: boolean) => act('admin_decide_refund', { p_id: id, p_approve: approve }),

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
