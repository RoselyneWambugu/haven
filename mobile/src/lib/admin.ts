import type { AdminCase, Severity, StaffRole } from '@/api/types'

// ---------------------------------------------------------------------------
// Roles and modules (PRD §3.2, §6.11). Each role sees only its own modules.
// ---------------------------------------------------------------------------

export type Module = 'overview' | 'cases' | 'users' | 'appeals' | 'therapists' | 'billing' | 'moderation' | 'analytics' | 'resources' | 'configuration' | 'roles' | 'wellbeing' | 'feedback' | 'groups' | 'audit'

export const MODULES: { key: Module; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'cases', label: 'Cases' },
  { key: 'users', label: 'Users' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'appeals', label: 'Appeals' },
  { key: 'therapists', label: 'Therapists' },
  { key: 'billing', label: 'Billing' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'resources', label: 'Resources' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'groups', label: 'Group chats' },
  { key: 'configuration', label: 'Config' },
  { key: 'roles', label: 'Roles' },
  { key: 'wellbeing', label: 'Wellbeing' },
  { key: 'audit', label: 'Audit log' },
]

const ACCESS: Record<StaffRole, Module[]> = {
  moderator: ['overview', 'cases', 'users', 'moderation', 'appeals', 'analytics', 'resources', 'wellbeing', 'groups'],
  clinical: ['overview', 'cases', 'appeals', 'therapists', 'analytics', 'resources', 'wellbeing', 'groups', 'audit'],
  billing: ['overview', 'users', 'billing', 'analytics', 'resources', 'feedback'],
  admin: ['overview', 'cases', 'users', 'moderation', 'appeals', 'therapists', 'billing', 'analytics', 'resources', 'feedback', 'groups', 'configuration', 'roles', 'wellbeing', 'audit'],
}

export const canAccess = (role: StaffRole, module: Module): boolean => ACCESS[role].includes(module)
export const ROLE_LABEL: Record<StaffRole, string> = { moderator: 'Moderator', clinical: 'Clinical reviewer', billing: 'Support / Billing', admin: 'Admin' }

/** Only an Admin may export the audit log (ADM-14). */
export const canExportAudit = (role: StaffRole): boolean => role === 'admin'

// ---------------------------------------------------------------------------
// Case queue (ADM-7): severity first, then least time left on the SLA clock.
// ---------------------------------------------------------------------------

const SEV: Record<Severity, number> = { S1: 0, S2: 1, S3: 2 }

export function minutesLeft(c: Pick<AdminCase, 'slaMinutes' | 'openedAt'>, now: number): number {
  return c.slaMinutes - Math.floor((now - c.openedAt) / 60_000)
}

export function sortCases<T extends Pick<AdminCase, 'severity' | 'slaMinutes' | 'openedAt' | 'status'>>(cases: T[], now: number): T[] {
  return [...cases].sort((a, b) => {
    const closed = Number(a.status === 'closed') - Number(b.status === 'closed')
    if (closed) return closed
    return SEV[a.severity] - SEV[b.severity] || minutesLeft(a, now) - minutesLeft(b, now)
  })
}

export function slaLabel(minutes: number): { text: string; breached: boolean } {
  if (minutes <= 0) return { text: `-${fmt(-minutes)}`, breached: true }
  return { text: fmt(minutes), breached: false }
}
const fmt = (m: number): string => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

export type CaseFilter = 'all' | 'S1' | 'crisis' | 'appeals' | 'mine' | 'unassigned'

export function filterCases(cases: AdminCase[], f: CaseFilter, me: string, query = ''): AdminCase[] {
  const q = query.trim().toLowerCase()
  return cases.filter((c) => {
    if (c.status === 'closed') return false
    if (q && !`${c.id} ${c.reporter ?? ''} ${c.reported}`.toLowerCase().includes(q)) return false
    if (f === 'S1') return c.severity === 'S1'
    if (f === 'crisis') return c.source === 'crisis-flag'
    if (f === 'appeals') return c.source === 'appeal'
    if (f === 'mine') return c.owner === me
    if (f === 'unassigned') return c.owner === null
    return true
  })
}

// ---------------------------------------------------------------------------
// Reviewer wellbeing (ADM-8) and break-glass (PRV-2, ADM-9). Limits are placeholders (D27).
// ---------------------------------------------------------------------------

export const DAILY_REVEAL_LIMIT = 20
export const BREAK_GLASS_MINUTES = 30
export const canReveal = (revealsToday: number): boolean => revealsToday < DAILY_REVEAL_LIMIT

export const REVEALS = ['name', 'phone', 'location'] as const

/** A request needs a reason and a real justification, and cannot be approved by the person who made it. */
export function validateBreakGlass(justification: string): string | null {
  return justification.trim().length < 15 ? 'Explain why this is necessary, in a sentence or two.' : null
}
export const canApprove = (requestedBy: string, approver: string, role: StaffRole): boolean => role === 'clinical' && requestedBy !== approver

// ---------------------------------------------------------------------------
// Moderation metrics (ADM-13). Counted from reviewed flags only.
// ---------------------------------------------------------------------------

export function flagMetrics(flags: { outcome: 'upheld' | 'overturned' | 'open'; reviewMinutes: number | null }[]): { precision: number | null; overturnRate: number | null; medianMinutes: number | null } {
  const done = flags.filter((f) => f.outcome !== 'open')
  if (!done.length) return { precision: null, overturnRate: null, medianMinutes: null }
  const upheld = done.filter((f) => f.outcome === 'upheld').length
  const mins = done.map((f) => f.reviewMinutes ?? 0).sort((a, b) => a - b)
  const mid = Math.floor(mins.length / 2)
  const median = mins.length % 2 ? mins[mid] : (mins[mid - 1] + mins[mid]) / 2
  return { precision: upheld / done.length, overturnRate: 1 - upheld / done.length, medianMinutes: median }
}

/** A strike policy change takes two different admins (ADM-13). */
export const policyApproved = (requestedBy: string, approvals: string[]): boolean => new Set(approvals.filter((a) => a !== requestedBy)).size >= 1

// ---------------------------------------------------------------------------
// Strike ladder (§6.7). Returns what the next sanction is for a given strike count.
// ---------------------------------------------------------------------------

export function nextSanction(strikesNow: number, severity: Severity): 'warning' | 'restriction' | 'suspension' {
  if (severity === 'S1') return 'suspension'
  if (strikesNow <= 0) return 'warning'
  if (strikesNow === 1) return 'restriction'
  return 'suspension'
}

/** Therapist concerns are for Clinical reviewers and Admins. Moderators do not see them (PRD §3.2: therapists are a clinical matter). */
export const canSeeCase = (role: StaffRole, c: Pick<AdminCase, 'queue'>): boolean => c.queue !== 'clinical' || role === 'clinical' || role === 'admin'
export const visibleCases = <T extends Pick<AdminCase, 'queue'>>(cases: T[], role: StaffRole): T[] => cases.filter((c) => canSeeCase(role, c))

/** Clinical reviewers and Admins schedule and cancel group chats. */
export const canManageGroups = (role: StaffRole): boolean => role === 'clinical' || role === 'admin'

/** Moderators, clinical reviewers and Admins can remove a person from a group chat that is open. Cancelling or scheduling one is for clinical reviewers and Admins only. */
export const canModerateGroups = (role: StaffRole): boolean => role === 'moderator' || role === 'clinical' || role === 'admin'
