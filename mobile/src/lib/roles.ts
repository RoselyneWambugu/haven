import type { StaffAccount, StaffChange, StaffRole } from '@/api/types'

// ---------------------------------------------------------------------------
// Roles and permissions (PRD §3.2, RBAC-1, RBAC-2). This is the one table of who may do what. Checks elsewhere in the
// dashboard are tested against it, so the table on screen can't drift from what is enforced.
// ---------------------------------------------------------------------------

export type Capability =
  | 'pseudonymousProfile' | 'realIdentity' | 'readConversations' | 'suspendRestore' | 'verifyTherapists' | 'issueRefunds' | 'changeRoles'

type Cell = 'yes' | 'no' | 'conditional'

/** Staff columns of the PRD table. Members and therapists are not staff, so they are not here. */
export const CAPABILITIES: { key: Capability; label: string; roles: Record<StaffRole, Cell>; note?: Partial<Record<StaffRole, string>> }[] = [
  { key: 'pseudonymousProfile', label: 'View a member’s pen-name profile', roles: { moderator: 'yes', clinical: 'yes', billing: 'yes', admin: 'yes' } },
  { key: 'realIdentity', label: 'View a member’s real identity', roles: { moderator: 'conditional', clinical: 'conditional', billing: 'conditional', admin: 'conditional' }, note: { moderator: 'Break-glass only', clinical: 'Crisis only', billing: 'Billing disputes only', admin: 'Logged' } },
  { key: 'readConversations', label: 'Read conversation content', roles: { moderator: 'conditional', clinical: 'conditional', billing: 'no', admin: 'no' }, note: { moderator: 'Only within an open case', clinical: 'Within an open case', admin: 'Via a case only' } },
  { key: 'suspendRestore', label: 'Suspend or restore accounts', roles: { moderator: 'yes', clinical: 'conditional', billing: 'no', admin: 'yes' }, note: { clinical: 'Recommend' } },
  { key: 'verifyTherapists', label: 'Verify therapists', roles: { moderator: 'no', clinical: 'yes', billing: 'no', admin: 'yes' } },
  { key: 'issueRefunds', label: 'Issue refunds', roles: { moderator: 'no', clinical: 'no', billing: 'yes', admin: 'yes' } },
  { key: 'changeRoles', label: 'Change roles and policy', roles: { moderator: 'no', clinical: 'no', billing: 'no', admin: 'yes' } },
]

export const can = (role: StaffRole, cap: Capability): boolean => CAPABILITIES.find((c) => c.key === cap)!.roles[role] === 'yes'

export const MIN_ACTIVE_ADMINS = 2

const label = (r: StaffRole): string => ({ moderator: 'Moderator', clinical: 'Clinical reviewer', billing: 'Support / Billing', admin: 'Admin' })[r]
export const roleName = label

/** Applies a change to the roster, or says why it can't be made. Nobody changes their own account, and two active Admins always remain. */
export function applyStaffChange(staff: StaffAccount[], change: StaffChange, actor: string, newId: string): { staff: StaffAccount[] } | { error: string } {
  const activeAdmins = (list: StaffAccount[]) => list.filter((s) => s.active && s.role === 'admin').length
  let next: StaffAccount[]
  if (change.kind === 'add') {
    const name = change.name.trim()
    if (name.length < 3 || name.length > 30) return { error: 'A name is 3 to 30 characters.' }
    if (staff.some((s) => s.name.toLowerCase() === name.toLowerCase())) return { error: 'Someone with that name is already on the team.' }
    next = [...staff, { id: newId, name, role: change.role, active: true, lastSignInAt: null }]
  } else {
    const who = staff.find((s) => s.id === change.id)
    if (!who) return { error: 'That person isn’t on the team.' }
    if (who.name === actor) return { error: 'You can’t change your own account. Ask another Admin.' }
    next = staff.map((s) => (s.id === change.id ? (change.kind === 'role' ? { ...s, role: change.role } : { ...s, active: change.active }) : s))
  }
  if (activeAdmins(next) < MIN_ACTIVE_ADMINS) return { error: `Keep at least ${MIN_ACTIVE_ADMINS} active Admins, so every sensitive change can have a second approver.` }
  return { staff: next }
}

export function describeChange(change: StaffChange, staff: StaffAccount[]): string {
  if (change.kind === 'add') return `Add ${change.name.trim()} as ${label(change.role)}`
  const who = staff.find((s) => s.id === change.id)?.name ?? 'someone'
  return change.kind === 'role' ? `Make ${who} ${label(change.role)}` : `${change.active ? 'Reactivate' : 'Deactivate'} ${who}`
}
