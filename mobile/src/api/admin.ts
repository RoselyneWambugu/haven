import { canExportAnalytics, toCsv } from '@/lib/analytics'
import { can } from '@/lib/roles'
import { atLimit, canTakeCase, DEFAULT_WELLBEING, emptyExposure, mondayStart, nextRota, onBreak, WEEK, weekOf } from '@/lib/wellbeing'
import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { BREAK_GLASS_MINUTES, canApprove, canExportAudit, nextSanction, policyApproved, validateBreakGlass, type Module, canAccess } from '@/lib/admin'
import { getDb, update, updateAccount } from '@/store/db'
import { showToast } from '@/store/toast'
import { account } from './support'
import type {
  AdminAppeal, AdminCase, AdminState, AdminUser, Applicant, AuditEntry, BreakGlassRequest, CaseAction, Notice, ReportReason, Res, Severity, StaffRole,
} from './types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const DEMO_MFA = '135790'
export const STAFF: { name: string; role: StaffRole }[] = [
  { name: 'T. Njeri', role: 'moderator' },
  { name: 'A. Mwangi', role: 'moderator' },
  { name: 'Dr. K. Mwende', role: 'clinical' },
  { name: 'J. Otieno', role: 'billing' },
  { name: 'S. Kamau', role: 'admin' },
  { name: 'R. Achieng', role: 'admin' },
]

function audit(actor: string, role: AuditEntry['role'], action: string, target: string, reason = ''): AuditEntry {
  return { id: uid('au'), at: now(), actor, role, action, target, reason }
}

function seed(): AdminState {
  const n = now()
  const ev = (...lines: [AdminCase['evidence'][number]['who'], string, boolean?][]) =>
    lines.map(([who, text, reported], i) => ({ id: `e${i}`, who, text, reported }))
  const mk = (p: Partial<AdminCase> & Pick<AdminCase, 'id' | 'severity' | 'source' | 'type' | 'slaMinutes' | 'reported'>): AdminCase => ({
    openedAt: n, owner: null, status: 'new', reporter: null, evidence: [], snapshotAt: n - 20 * HOUR, ai: null, strikes: 0, priorReports: 0, decision: null, escalated: false, ...p,
  })
  const cases: AdminCase[] = [
    mk({ id: 'C-1049', severity: 'S1', source: 'crisis-flag', type: 'Self-harm risk', slaMinutes: 4, reported: 'MorningSun', evidence: ev(['reported', 'I don’t think I can keep going like this', true], ['reporter', 'I’m here. Can you tell me more?']), ai: { category: 'Self-harm risk', confidence: 0.96, model: 'v2.3' } }),
    mk({ id: 'C-1046', severity: 'S1', source: 'user-report', type: 'Threat', slaMinutes: 21, owner: 'A. Mwangi', status: 'in-review', reporter: 'SilverRiver', reported: 'BlueHeron', evidence: ev(['reporter', 'Please stop messaging me'], ['reported', 'You will regret this', true]), priorReports: 1 }),
    mk({
      id: 'C-1042', severity: 'S2', source: 'user-report', type: 'Sexual advances', slaMinutes: 100, owner: 'T. Njeri', status: 'in-review', reporter: 'SilverRiver', reported: 'QuietPine', strikes: 1, priorReports: 2,
      evidence: ev(['reporter', 'That sounds heavy, want to talk?'], ['reported', 'Thanks, it has been a long week'], ['reported', 'Send me your number, you’re cute 😉', true]), ai: { category: 'Sexual solicitation', confidence: 0.91, model: 'v2.3' },
    }),
    mk({ id: 'C-1040', severity: 'S2', source: 'ai-flag', type: 'Scam / money', slaMinutes: 130, reported: 'WanderingStar', evidence: ev(['reported', 'Send KES 500 and I will help you get a job', true]), ai: { category: 'Scam / money', confidence: 0.88, model: 'v2.3' } }),
    mk({ id: 'C-1037', severity: 'S3', source: 'ai-flag', type: 'Contact sharing', slaMinutes: 360, owner: 'T. Njeri', status: 'waiting', reported: 'GentleFern', evidence: ev(['reported', 'Add me on the usual app', true]), ai: { category: 'Contact sharing', confidence: 0.97, model: 'v2.3' } }),
  ]
  const person = (penName: string, p: Partial<AdminUser> = {}): AdminUser => ({
    id: `u-${penName}`, penName, joined: 'Aug 2026', languages: 'English', ageBand: '25-34', standing: 'good', strikes: [], reportsAgainst: 0, reportsMade: 0, blocksReceived: 0, plan: 'Monthly, active', matches: 8, skips: 2, isMember: false, ...p,
  })
  return {
    signedIn: false,
    role: 'moderator',
    staffName: 'T. Njeri',
    exposure: { 'T. Njeri': { count: 3, sinceBreak: 3, breakUntil: null } },
    revealed: [],
    staff: STAFF.map((s, i) => ({ id: `st${i + 1}`, name: s.name, role: s.role, active: true, lastSignInAt: null })),
    pendingStaff: null,
    wellbeing: { ...DEFAULT_WELLBEING },
    rota: [
      { weekStart: mondayStart(n), heavy: ['A. Mwangi'] },
      { weekStart: mondayStart(n) + WEEK, heavy: nextRota(['A. Mwangi'], ['T. Njeri', 'A. Mwangi'], 1) },
    ],
    cases,
    users: [
      person('QuietPine', { reportsAgainst: 3, blocksReceived: 5, matches: 14, skips: 6, strikes: [{ id: 's1', at: n - 7 * DAY, rule: 'Contact sharing', kind: 'Warning' }], standing: 'good' }),
      person('SilverRiver', { reportsMade: 4, languages: 'English, Kiswahili' }),
      person('BlueHeron', { reportsAgainst: 1, blocksReceived: 2, languages: 'English, Kiswahili' }),
      person('MorningSun', { ageBand: '18-24', plan: 'Daily, active' }),
      person('WanderingStar', { ageBand: '18-24', reportsAgainst: 1 }),
    ],
    appeals: [
      {
        id: 'A-221', noticeId: null, caseId: 'C-1031', penName: 'RainyDay', decision: 'Strike 2, 24 hour restriction, “Targeted harassment”', decidedBy: 'T. Njeri',
        statement: 'I was quoting someone else’s message, not insulting my match. Please check the context.', openedAt: n - 6 * HOUR, slaHours: 18, status: 'open', reviewer: null,
      },
    ],
    breakGlass: [],
    refunds: [
      { id: 'R-310', penName: 'NightOwl22', plan: 'Monthly', reason: 'Double charge', status: 'pending', decidedBy: null },
      { id: 'R-309', penName: 'KindLeaf', plan: 'Daily', reason: 'Didn’t receive access', status: 'pending', decidedBy: null },
      { id: 'R-307', penName: 'RainyDay', plan: 'Yearly', reason: 'Changed mind (day 5)', status: 'pending', decidedBy: null },
    ],
    unmatchedPayments: 2,
    flags: [
      { id: 'F-7712', category: 'Sexual solicitation', confidence: 0.91, model: 'v2.3', outcome: 'upheld', reviewMinutes: 14 },
      { id: 'F-7711', category: 'Harassment', confidence: 0.64, model: 'v2.3', outcome: 'overturned', reviewMinutes: 22 },
      { id: 'F-7709', category: 'Contact sharing', confidence: 0.97, model: 'v2.3', outcome: 'upheld', reviewMinutes: 6 },
      { id: 'F-7705', category: 'Scam / money', confidence: 0.88, model: 'v2.3', outcome: 'upheld', reviewMinutes: 18 },
      { id: 'F-7703', category: 'Harassment', confidence: 0.58, model: 'v2.3', outcome: 'open', reviewMinutes: null },
    ],
    applicants: [{ id: 'T-88', name: 'Dr. Amina Otieno', licenceNo: '1234', licenceExpiry: n + 400 * DAY, checklist: { name: false, licence: false, expiry: false, qualification: false }, status: 'pending', message: '' }],
    policy: { expiryDays: 90, restrictionHours: 24 },
    policyChange: null,
    audit: [
      audit('System', 'system', 'Suspended user (S1)', 'User 5521', 'Policy'),
      audit('S. Kamau', 'admin', 'Exported data', 'User 4410', 'Member request'),
    ].map((a, i) => ({ ...a, at: n - (i + 3) * HOUR })),
  }
}

function patch(fn: (a: AdminState) => Partial<AdminState>) {
  update((s) => (s.admin ? { admin: { ...s.admin, ...fn(s.admin) } } : {}))
}
export const me = () => {
  const a = getDb().admin!
  return { name: a.staffName, role: a.role }
}
export function log(action: string, target: string, reason = '') {
  const { name, role } = me()
  patch((a) => ({ audit: [audit(name, role, action, target, reason), ...a.audit] }))
}

const SEV_BY_REASON: Record<ReportReason, Severity> = { 'self-harm': 'S1', threats: 'S1', sexual: 'S2', hate: 'S2', harassment: 'S2', scam: 'S2', impersonation: 'S3', other: 'S3' }
const SLA: Record<Severity, number> = { S1: 60, S2: 240, S3: 720 }
const REASON_LABEL: Record<ReportReason, string> = { 'self-harm': 'Self-harm concern', threats: 'Threat', sexual: 'Sexual content', hate: 'Hate speech', harassment: 'Harassment', scam: 'Scam or solicitation', impersonation: 'Impersonation', other: 'Other' }

/** Applies a sanction to the member signed in on this device, so staff decisions are visible in the member app. */
function sanctionMember(kind: Notice['kind'], rule: string) {
  updateAccount((acct) => {
    const expiresAt = kind === 'warning' ? now() + 90 * DAY : kind === 'restriction' ? now() + DAY : null
    const notice: Notice = {
      id: uid('n'), kind, rule, at: now(), expiresAt, appeal: 'none',
      explanation: kind === 'warning' ? 'This breaks our community guidelines. This is a warning, and nothing else changes.' : kind === 'restriction' ? 'You can’t send new messages for a short time. You can still read and use help.' : 'Your account is paused while our team reviews it. You can still reach urgent help.',
    }
    return { ...acct, notices: [notice, ...acct.notices], standing: kind === 'suspension' ? 'paused' : kind === 'restriction' ? 'restricted' : acct.standing }
  })
}

export const admin = {
  signIn(name: string, code: string): Res {
    const roster = getDb().admin?.staff ?? STAFF.map((s, i) => ({ id: `st${i + 1}`, ...s, active: true, lastSignInAt: null }))
    const who = roster.find((s) => s.name === name)
    if (!who) return { ok: false, error: 'Choose who you are.' }
    if (!who.active) return { ok: false, error: 'This account has been deactivated. Ask an Admin.', code: 'inactive' }
    if (code !== DEMO_MFA) return { ok: false, error: 'That code doesn’t match.', code: 'mfa' }
    if (!getDb().admin) update({ admin: seed() })
    patch((a) => ({ signedIn: true, role: who.role, staffName: who.name, staff: a.staff.map((s) => (s.name === who.name ? { ...s, lastSignInAt: now() } : s)) }))
    log('Signed in', 'Dashboard', 'MFA')
    return { ok: true, value: undefined }
  },
  signOut(): void {
    patch(() => ({ signedIn: false }))
  },

  /** Member reports become cases (SAF-3). Called whenever the number of reports changes. */
  syncReports(): void {
    const db = getDb()
    const a = db.admin
    if (!a) return
    const known = new Set(a.cases.map((c) => c.id))
    const fresh = db.reports.filter((r) => !known.has(`C-${r.id}`))
    if (!fresh.length) return
    const mine = db.account?.public.penName ?? 'A member'
    const add: AdminCase[] = fresh.map((r) => {
      const reason = (r.reason as ReportReason) in SEV_BY_REASON ? (r.reason as ReportReason) : 'other'
      const sev = SEV_BY_REASON[reason]
      return {
        id: `C-${r.id}`, severity: sev, source: 'user-report', type: REASON_LABEL[reason], slaMinutes: SLA[sev], openedAt: r.at, owner: null, status: 'new', reporter: mine,
        reported: r.target === 'member' ? 'Reported member' : `Reported ${r.target}`, snapshotAt: r.at, ai: null, strikes: 0, priorReports: 0, decision: null, escalated: false,
        evidence: [{ id: 'e0', who: 'reported', text: r.note || 'Message content is captured in the snapshot on the real service.', reported: true }],
      }
    })
    patch((x) => ({ cases: [...add, ...x.cases] }))
  },

  claim(id: string): Res {
    const { name, role } = me()
    const a = getDb().admin!
    const c = a.cases.find((x) => x.id === id)
    if (!c) return { ok: false, error: 'Case not found.' }
    if (!canTakeCase(c, { name, role }, weekOf(a.rota, now())?.heavy ?? [])) return { ok: false, error: 'Severity-1 and crisis cases are worked by the moderators on this week’s heavy-queue rota. Ask someone on the rota, or a clinical reviewer.', code: 'rota' }
    patch((a) => ({ cases: a.cases.map((c) => (c.id === id ? { ...c, owner: name, status: c.status === 'new' ? 'in-review' : c.status } : c)) }))
    log('Took case', id)
    return { ok: true, value: undefined }
  },
  /** Opening a case is itself logged, because it exposes content (PRV-1). */
  view(id: string): void {
    log('Viewed case content', id, 'Review')
  },
  reveal(caseId: string, lineId: string): Res {
    const a = getDb().admin!
    const { name } = me()
    const key = `${name}|${caseId}:${lineId}`
    if (a.revealed.includes(key)) return { ok: true, value: undefined }
    const e = a.exposure[name] ?? emptyExposure()
    if (onBreak(e, now())) return { ok: false, error: 'You’re on a break. Revealing opens again when it ends.', code: 'break' }
    if (atLimit(e, a.wellbeing)) return { ok: false, error: 'You’ve reached today’s limit. Take a break, and ask a colleague to continue.', code: 'limit' }
    patch((x) => ({ revealed: [...x.revealed, key], exposure: { ...x.exposure, [name]: { ...e, count: e.count + 1, sinceBreak: e.sinceBreak + 1 } } }))
    log('Revealed message', `${caseId}:${lineId}`)
    return { ok: true, value: undefined }
  },

  decide(caseId: string, action: CaseAction, reason: string): Res {
    const a = getDb().admin!
    const c = a.cases.find((x) => x.id === caseId)
    if (!c) return { ok: false, error: 'Case not found.' }
    if (reason.trim().length < 5) return { ok: false, error: 'A reason is required.', code: 'reason' }
    const { name, role } = me()
    if ((action === 'strike' || action === 'restrict' || action === 'suspend') && !can(role, 'suspendRestore')) return { ok: false, error: 'Your role recommends a sanction. Escalate the case so a moderator or Admin can apply it.', code: 'role' }
    const memberName = getDb().account?.public.penName
    const targetIsMember = !!memberName && c.reported === memberName
    const sanction = action === 'strike' ? nextSanction(c.strikes, c.severity) : action === 'restrict' ? 'restriction' : action === 'suspend' ? 'suspension' : null
    if (sanction && targetIsMember) sanctionMember(sanction, c.type)
    patch((x) => ({
      cases: x.cases.map((q) =>
        q.id === caseId
          ? { ...q, decision: { action, reason: reason.trim(), by: name, at: now() }, status: action === 'escalate' ? 'waiting' : 'closed', owner: action === 'escalate' ? null : name, escalated: action === 'escalate' || q.escalated, strikes: action === 'strike' ? q.strikes + 1 : q.strikes }
          : q,
      ),
    }))
    log(action === 'dismiss' ? 'Dismissed case' : action === 'escalate' ? 'Escalated case' : `Decided: ${action}`, caseId, reason.trim())
    return { ok: true, value: undefined }
  },

  // --- break-glass (PRV-2, ADM-9) ---
  requestBreakGlass(caseId: string, input: { reasonCode: BreakGlassRequest['reasonCode']; justification: string }): Res<{ id: string }> {
    const a = getDb().admin!
    const c = a.cases.find((x) => x.id === caseId)
    if (!c) return { ok: false, error: 'Case not found.' }
    const problem = validateBreakGlass(input.justification)
    if (problem) return { ok: false, error: problem, code: 'justification' }
    const { name } = me()
    const req: BreakGlassRequest = { id: uid('bg'), caseId, target: c.reported, reasonCode: input.reasonCode, justification: input.justification.trim(), requestedBy: name, requestedAt: now(), status: 'pending', approvedBy: null, expiresAt: null }
    patch((x) => ({ breakGlass: [req, ...x.breakGlass] }))
    log('Break-glass requested', c.reported, input.reasonCode)
    return { ok: true, value: { id: req.id } }
  },
  decideBreakGlass(id: string, approve: boolean): Res {
    const a = getDb().admin!
    const r = a.breakGlass.find((x) => x.id === id)
    const { name, role } = me()
    if (!r || r.status !== 'pending') return { ok: false, error: 'This request has already been handled.' }
    if (!canApprove(r.requestedBy, name, role)) return { ok: false, error: 'A second person must approve this: the on-call clinical lead, not the requester.', code: 'second-person' }
    patch((x) => ({
      breakGlass: x.breakGlass.map((q) => (q.id === id ? { ...q, status: approve ? 'approved' : 'declined', approvedBy: name, expiresAt: approve ? now() + BREAK_GLASS_MINUTES * MIN : null } : q)),
    }))
    log(approve ? 'Break-glass approved' : 'Break-glass declined', r.target, approve ? `${BREAK_GLASS_MINUTES} min` : '')
    return { ok: true, value: undefined }
  },
  /** Returns the private details only while an approval is live. The member is not told. */
  privateProfile(requestId: string): { name: string; phone: string; location: string; minutesLeft: number } | null {
    const a = getDb().admin
    const r = a?.breakGlass.find((x) => x.id === requestId)
    if (!a || !r || r.status !== 'approved' || !r.expiresAt || r.expiresAt <= now()) return null
    const acct = getDb().account
    const isMember = acct?.public.penName === r.target
    log('Viewed private profile', r.target, r.reasonCode)
    return {
      name: isMember ? acct!.private.fullName : 'Name on record',
      phone: isMember ? acct!.private.phone : '+254 7•• ••• •••',
      location: 'Nairobi (approximate)',
      minutesLeft: Math.max(0, Math.ceil((r.expiresAt - now()) / MIN)),
    }
  },

  // --- users (ADM: Users) ---
  users(): AdminUser[] {
    const db = getDb()
    const a = db.admin
    if (!a) return []
    const acct = db.account
    const list = [...a.users]
    if (acct) {
      list.unshift({
        id: 'member', penName: acct.public.penName, joined: 'Today', languages: acct.public.languages.join(', '), ageBand: acct.public.ageBand, standing: acct.standing,
        strikes: acct.notices.map((n) => ({ id: n.id, at: n.at, rule: n.rule, kind: n.kind === 'warning' ? 'Warning' : n.kind === 'restriction' ? 'Restriction' : 'Suspension' })),
        reportsAgainst: 0, reportsMade: db.reports.length, blocksReceived: 0, plan: db.subscription ? 'Active plan' : 'No plan', matches: db.conversations.filter((c) => c.kind === 'peer').length, skips: 0, isMember: true,
      })
    }
    return list
  },
  userAction(userId: string, action: 'restrict' | 'suspend' | 'restore', reason: string): Res {
    if (!can(me().role, 'suspendRestore')) return { ok: false, error: 'Your role can’t suspend or restore accounts.', code: 'role' }
    if (reason.trim().length < 5) return { ok: false, error: 'A reason is required.', code: 'reason' }
    const u = this.users().find((x) => x.id === userId)
    if (!u) return { ok: false, error: 'User not found.' }
    const standing = action === 'restore' ? 'good' : action === 'restrict' ? 'restricted' : 'paused'
    if (u.isMember) {
      if (action === 'restore') updateAccount((acct) => ({ ...acct, standing: 'good' }))
      else sanctionMember(action === 'restrict' ? 'restriction' : 'suspension', reason.trim())
    } else {
      patch((a) => ({ users: a.users.map((x) => (x.id === userId ? { ...x, standing } : x)) }))
    }
    log(action === 'restore' ? 'Restored user' : action === 'restrict' ? 'Restricted user' : 'Suspended user', u.penName, reason.trim())
    return { ok: true, value: undefined }
  },
  exportUser(userId: string): Res<{ json: string }> {
    const { role, name } = me()
    if (role !== 'admin') return { ok: false, error: 'Only an Admin can export personal data.', code: 'role' }
    const u = this.users().find((x) => x.id === userId)
    if (!u) return { ok: false, error: 'User not found.' }
    log('Exported data', u.penName, 'Member request')
    return { ok: true, value: { json: u.isMember ? account.exportData() : JSON.stringify({ penName: u.penName, exportedBy: name }, null, 2) } }
  },

  // --- appeals (SAF-14, ADM-10) ---
  appeals(): AdminAppeal[] {
    const db = getDb()
    const a = db.admin
    if (!a) return []
    const fromMember: AdminAppeal[] = (db.account?.notices ?? [])
      .filter((n) => n.appeal !== 'none')
      .map((n) => ({
        id: `A-${n.id}`, noticeId: n.id, caseId: 'C-member', penName: db.account!.public.penName, decision: `${n.kind}: ${n.rule}`, decidedBy: 'T. Njeri', statement: n.appealText ?? '', openedAt: n.at,
        slaHours: 24, status: n.appeal === 'pending' ? 'open' : (n.appeal as AdminAppeal['status']), reviewer: n.appeal === 'pending' ? null : 'A. Mwangi',
      }))
    return [...fromMember, ...a.appeals]
  },
  decideAppeal(id: string, outcome: 'upheld' | 'reduced' | 'overturned', explanation: string): Res {
    const ap = this.appeals().find((x) => x.id === id)
    const { name } = me()
    if (!ap) return { ok: false, error: 'Appeal not found.' }
    if (ap.status !== 'open') return { ok: false, error: 'This appeal has already been decided.' }
    if (ap.decidedBy === name) return { ok: false, error: 'You made the original decision. An appeal must be reviewed by someone else.', code: 'same-reviewer' }
    if (explanation.trim().length < 10) return { ok: false, error: 'Explain the outcome to the member.', code: 'explanation' }
    if (ap.noticeId) {
      updateAccount((acct) => ({
        ...acct,
        notices: acct.notices.map((n) => (n.id === ap.noticeId ? { ...n, appeal: outcome } : n)),
        standing: outcome !== 'upheld' && acct.standing !== 'good' ? 'good' : acct.standing,
      }))
      showToast('Your appeal has been decided. See Account standing.')
    } else {
      patch((a) => ({ appeals: a.appeals.map((x) => (x.id === id ? { ...x, status: outcome, reviewer: name } : x)) }))
    }
    log(`Appeal ${outcome}`, id, explanation.trim())
    return { ok: true, value: undefined }
  },
  reassignAppeal(id: string): void {
    const { name } = me()
    patch((a) => ({ appeals: a.appeals.map((x) => (x.id === id ? { ...x, reviewer: name } : x)) }))
  },

  // --- therapist verification (ADM-11) ---
  applicants(): Applicant[] {
    const db = getDb()
    const a = db.admin
    if (!a) return []
    const list = [...a.applicants]
    const app = db.portal?.application
    if (app === 'submitted') list.push({ id: 'T-portal', name: 'New applicant (from the portal)', licenceNo: '5588', licenceExpiry: now() + 300 * DAY, checklist: { name: false, licence: false, expiry: false, qualification: false }, status: 'pending', message: '' })
    return list
  },
  verify(id: string, decision: 'approved' | 'info' | 'rejected', message: string, checklist: Applicant['checklist']): Res {
    if (!can(me().role, 'verifyTherapists')) return { ok: false, error: 'Only clinical reviewers and Admins verify therapists.', code: 'role' }
    const t = this.applicants().find((x) => x.id === id)
    if (!t) return { ok: false, error: 'Applicant not found.' }
    if (decision === 'approved' && !Object.values(checklist).every(Boolean)) return { ok: false, error: 'Tick every check before approving.', code: 'checklist' }
    if (message.trim().length < 5) return { ok: false, error: 'Write a message to the applicant.', code: 'message' }
    if (id === 'T-portal') {
      update((s) => (s.portal ? { portal: { ...s.portal, application: decision === 'approved' ? 'approved' : decision === 'info' ? 'more-info' : 'none' } } : {}))
    } else {
      patch((a) => ({ applicants: a.applicants.map((x) => (x.id === id ? { ...x, status: decision, message: message.trim() } : x)) }))
    }
    log(decision === 'approved' ? 'Approved therapist' : decision === 'info' ? 'Requested more information' : 'Rejected therapist', t.name, message.trim())
    return { ok: true, value: undefined }
  },

  // --- billing (ADM-12) ---
  decideRefund(id: string, approve: boolean): Res {
    const { name, role } = me()
    if (!can(role, 'issueRefunds')) return { ok: false, error: 'Only billing staff can decide refunds.', code: 'role' }
    const r = getDb().admin!.refunds.find((x) => x.id === id)
    if (!r || r.status !== 'pending') return { ok: false, error: 'This refund has been decided.' }
    patch((a) => ({ refunds: a.refunds.map((x) => (x.id === id ? { ...x, status: approve ? 'approved' : 'declined', decidedBy: name } : x)) }))
    log(approve ? 'Approved refund' : 'Declined refund', id, r.reason)
    return { ok: true, value: undefined }
  },

  // --- strike policy (ADM-13, D5) ---
  proposePolicy(policy: AdminState['policy']): Res {
    const { name, role } = me()
    if (role !== 'admin') return { ok: false, error: 'Only an Admin can change the strike policy.', code: 'role' }
    if (policy.expiryDays < 30 || policy.expiryDays > 365 || policy.restrictionHours < 1 || policy.restrictionHours > 168) return { ok: false, error: 'Use 30 to 365 days for expiry and 1 to 168 hours for restrictions.', code: 'range' }
    patch(() => ({ policyChange: { policy, requestedBy: name, approvals: [] } }))
    log('Proposed strike policy change', 'Strike policy', `${policy.expiryDays} d, ${policy.restrictionHours} h`)
    return { ok: true, value: undefined }
  },
  approvePolicy(): Res {
    const { name, role } = me()
    const a = getDb().admin!
    if (role !== 'admin' || !a.policyChange) return { ok: false, error: 'There is nothing to approve.' }
    if (a.policyChange.requestedBy === name) return { ok: false, error: 'A second admin has to approve this.', code: 'second-person' }
    const approvals = [...a.policyChange.approvals, name]
    if (policyApproved(a.policyChange.requestedBy, approvals)) {
      patch(() => ({ policy: a.policyChange!.policy, policyChange: null }))
      log('Approved strike policy change', 'Strike policy')
    }
    return { ok: true, value: undefined }
  },
  cancelPolicy(): void {
    patch(() => ({ policyChange: null }))
  },

  // --- audit (ADM-14) ---
  exportAudit(): Res<{ csv: string }> {
    const { role } = me()
    if (!canExportAudit(role)) return { ok: false, error: 'Only an Admin can export the audit log.', code: 'role' }
    const rows = getDb().admin!.audit
    log('Exported audit log', 'Audit log', `${rows.length} entries`)
    const csv = ['Time,Actor,Action,Target,Reason', ...getDb().admin!.audit.map((r) => `${new Date(r.at).toISOString()},${r.actor},${r.action},${r.target},"${r.reason.replace(/"/g, '""')}"`)].join('\n')
    return { ok: true, value: { csv } }
  },

  /** Aggregate figures are not personal data, but exporting them is still logged and limited to Admins. */
  exportAnalytics(section: string, rows: (string | number | null)[][]): Res<{ csv: string }> {
    const { role } = me()
    if (!canExportAnalytics(role)) return { ok: false, error: 'Only an Admin can export analytics.', code: 'role' }
    log('Exported analytics', section, `${rows.length} rows`)
    return { ok: true, value: { csv: toCsv(rows) } }
  },

  can(module: Module): boolean {
    const a = getDb().admin
    return !!a && canAccess(a.role, module)
  },
}
