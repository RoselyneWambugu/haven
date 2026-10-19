import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA, STAFF } from '../src/api/admin'
import { canAccess, canExportAudit } from '../src/lib/admin'
import { canEditConfig, canEditDirectory } from '../src/lib/content'
import { applyStaffChange, CAPABILITIES, can, describeChange, MIN_ACTIVE_ADMINS } from '../src/lib/roles'
import { atLimit, breakSuggested, canTakeCase, DEFAULT_WELLBEING, emptyExposure, isHeavy, mondayStart, nextRota, onBreak, validateWellbeing, WEEK, weekOf } from '../src/lib/wellbeing'
import { advanceClock, resetClock } from '../src/lib/clock'
import { freshState, getDb, update } from '../src/store/db'
import type { StaffAccount, StaffRole } from '../src/api/types'

const as = (name: string) => expect(api.admin.signIn(name, DEMO_MFA).ok).toBe(true)
const a = () => getDb().admin!
const ROLES: StaffRole[] = ['moderator', 'clinical', 'billing', 'admin']

describe('the permission table', () => {
  it('matches the PRD for each capability', () => {
    expect(ROLES.map((r) => can(r, 'issueRefunds'))).toEqual([false, false, true, true])
    expect(ROLES.map((r) => can(r, 'verifyTherapists'))).toEqual([false, true, false, true])
    expect(ROLES.map((r) => can(r, 'suspendRestore'))).toEqual([true, false, false, true])
    expect(ROLES.map((r) => can(r, 'changeRoles'))).toEqual([false, false, false, true])
  })
  it('gives no one unconditional access to real identity or to conversations', () => {
    for (const r of ROLES) {
      expect(can(r, 'realIdentity')).toBe(false)
      expect(can(r, 'readConversations')).toBe(false)
    }
  })
  it('explains every conditional cell', () => {
    for (const c of CAPABILITIES) for (const r of ROLES) if (c.roles[r] === 'conditional') expect(c.note?.[r]).toBeTruthy()
  })
  it('agrees with the checks the rest of the dashboard uses', () => {
    for (const r of ROLES) {
      expect(canEditConfig(r)).toBe(can(r, 'changeRoles'))
      expect(canExportAudit(r)).toBe(can(r, 'changeRoles'))
    }
    expect(canEditDirectory('clinical')).toBe(true)
    expect(canAccess('admin', 'roles')).toBe(true)
    for (const r of ['moderator', 'clinical', 'billing'] as const) expect(canAccess(r, 'roles')).toBe(false)
  })
})

describe('changing the team', () => {
  const staff: StaffAccount[] = [
    { id: '1', name: 'A One', role: 'admin', active: true, lastSignInAt: null },
    { id: '2', name: 'B Two', role: 'admin', active: true, lastSignInAt: null },
    { id: '3', name: 'C Three', role: 'moderator', active: true, lastSignInAt: null },
  ]
  it('adds someone and checks the name', () => {
    expect('staff' in applyStaffChange(staff, { kind: 'add', name: 'D Four', role: 'billing' }, 'A One', 'x')).toBe(true)
    expect(applyStaffChange(staff, { kind: 'add', name: 'ab', role: 'billing' }, 'A One', 'x')).toHaveProperty('error')
    expect(applyStaffChange(staff, { kind: 'add', name: 'c three', role: 'billing' }, 'A One', 'x')).toHaveProperty('error')
  })
  it('never changes your own account', () => {
    expect(applyStaffChange(staff, { kind: 'role', id: '1', role: 'moderator' }, 'A One', 'x')).toMatchObject({ error: expect.stringMatching(/own account/) })
  })
  it(`keeps at least ${MIN_ACTIVE_ADMINS} active Admins`, () => {
    expect(applyStaffChange(staff, { kind: 'active', id: '2', active: false }, 'A One', 'x')).toMatchObject({ error: expect.stringMatching(/at least 2/) })
    expect(applyStaffChange(staff, { kind: 'role', id: '2', role: 'clinical' }, 'A One', 'x')).toHaveProperty('error')
    expect(applyStaffChange(staff, { kind: 'role', id: '3', role: 'admin' }, 'A One', 'x')).toHaveProperty('staff')
  })
  it('describes a change in words', () => {
    expect(describeChange({ kind: 'role', id: '3', role: 'clinical' }, staff)).toBe('Make C Three Clinical reviewer')
    expect(describeChange({ kind: 'active', id: '3', active: false }, staff)).toBe('Deactivate C Three')
  })
})

describe('reviewer wellbeing rules', () => {
  const cfg = DEFAULT_WELLBEING
  it('stops at the daily limit and suggests breaks without forcing them', () => {
    expect(atLimit({ ...emptyExposure(), count: 19 }, cfg)).toBe(false)
    expect(atLimit({ ...emptyExposure(), count: 20 }, cfg)).toBe(true)
    expect(breakSuggested({ ...emptyExposure(), sinceBreak: 7 }, cfg, 0)).toBe(false)
    expect(breakSuggested({ ...emptyExposure(), sinceBreak: 8 }, cfg, 0)).toBe(true)
    expect(breakSuggested({ count: 9, sinceBreak: 9, breakUntil: 1000 }, cfg, 500)).toBe(false)
    expect(onBreak({ ...emptyExposure(), breakUntil: 1000 }, 500)).toBe(true)
    expect(onBreak({ ...emptyExposure(), breakUntil: 1000 }, 1500)).toBe(false)
  })
  it('bounds the settings', () => {
    expect(validateWellbeing(cfg)).toBeNull()
    expect(validateWellbeing({ ...cfg, dailyLimit: 2 })).not.toBeNull()
    expect(validateWellbeing({ ...cfg, breakEvery: 30 })).not.toBeNull()
    expect(validateWellbeing({ ...cfg, breakMinutes: 0 })).not.toBeNull()
  })
  it('keeps the heaviest content to people on the rota', () => {
    const s1 = { severity: 'S1' as const, source: 'user-report' as const }
    const crisis = { severity: 'S2' as const, source: 'crisis-flag' as const }
    const s2 = { severity: 'S2' as const, source: 'user-report' as const }
    expect([isHeavy(s1), isHeavy(crisis), isHeavy(s2)]).toEqual([true, true, false])
    expect(canTakeCase(s1, { name: 'T', role: 'moderator' }, ['A'])).toBe(false)
    expect(canTakeCase(s1, { name: 'A', role: 'moderator' }, ['A'])).toBe(true)
    expect(canTakeCase(s1, { name: 'K', role: 'clinical' }, [])).toBe(true)
    expect(canTakeCase(s2, { name: 'T', role: 'moderator' }, [])).toBe(true)
  })
  it('rotates people who were off the heavy queue last week to the front', () => {
    expect(nextRota(['A'], ['T', 'A'], 1)).toEqual(['T'])
    expect(nextRota(['T'], ['T', 'A'], 1)).toEqual(['A'])
    expect(nextRota(['A', 'B'], ['A', 'B', 'C', 'D'], 2)).toEqual(['C', 'D'])
    expect(nextRota([], ['A'], 3)).toEqual(['A'])
  })
  it('finds the week and starts it on Monday, Kenya time', () => {
    const wed = Date.UTC(2026, 9, 21, 12)
    const mon = mondayStart(wed)
    expect(new Date(mon + 3 * 3_600_000).getUTCDay()).toBe(1)
    expect(weekOf([{ weekStart: mon, heavy: ['A'] }], wed)?.heavy).toEqual(['A'])
    expect(weekOf([{ weekStart: mon + WEEK, heavy: ['A'] }], wed)).toBeUndefined()
  })
})

describe('team api', () => {
  beforeEach(() => {
    resetClock()
    update(freshState())
    as('S. Kamau')
  })

  it('needs a second Admin to approve a team change', () => {
    expect(api.team.proposeStaff({ kind: 'add', name: 'N. Wafula', role: 'moderator' }).ok).toBe(true)
    expect(api.team.approveStaff()).toMatchObject({ ok: false, code: 'second-person' })
    expect(a().staff.some((s) => s.name === 'N. Wafula')).toBe(false)
    as('R. Achieng')
    expect(api.team.approveStaff().ok).toBe(true)
    expect(a().staff.some((s) => s.name === 'N. Wafula' && s.role === 'moderator')).toBe(true)
    expect(a().pendingStaff).toBeNull()
  })

  it('lets only Admins change the team, and one change at a time', () => {
    as('T. Njeri')
    expect(api.team.proposeStaff({ kind: 'add', name: 'N. Wafula', role: 'moderator' })).toMatchObject({ ok: false, code: 'role' })
    as('S. Kamau')
    api.team.proposeStaff({ kind: 'add', name: 'N. Wafula', role: 'moderator' })
    expect(api.team.proposeStaff({ kind: 'add', name: 'P. Otieno', role: 'billing' })).toMatchObject({ ok: false, code: 'pending' })
  })

  it('stops a deactivated person signing in', () => {
    const t = a().staff.find((s) => s.name === 'T. Njeri')!
    api.team.proposeStaff({ kind: 'active', id: t.id, active: false })
    as('R. Achieng')
    api.team.approveStaff()
    expect(api.admin.signIn('T. Njeri', DEMO_MFA)).toMatchObject({ ok: false, code: 'inactive' })
  })

  it('takes a role change effect at the next sign-in', () => {
    const t = a().staff.find((s) => s.name === 'T. Njeri')!
    api.team.proposeStaff({ kind: 'role', id: t.id, role: 'billing' })
    as('R. Achieng')
    api.team.approveStaff()
    as('T. Njeri')
    expect(a().role).toBe('billing')
  })

  it('records who is on the team and the second factor is not optional', () => {
    expect(a().staff.length).toBe(STAFF.length)
    expect(api.admin.signIn('S. Kamau', '000000')).toMatchObject({ ok: false, code: 'mfa' })
    expect(a().audit.map((x) => x.action)).toContain('Signed in')
  })

  it('applies the permission table in the API', () => {
    as('Dr. K. Mwende')
    expect(api.admin.decide('C-1042', 'suspend', 'Repeated sexual advances')).toMatchObject({ ok: false, code: 'role' })
    expect(api.admin.decide('C-1042', 'escalate', 'Needs a moderator to apply it').ok).toBe(true)
    expect(api.admin.userAction('u-QuietPine', 'suspend', 'Repeated sexual advances')).toMatchObject({ ok: false, code: 'role' })
    as('J. Otieno')
    expect(api.admin.verify('T-88', 'info', 'Please send a clearer copy', { name: true, licence: false, expiry: false, qualification: true })).toMatchObject({ ok: false, code: 'role' })
    expect(api.admin.decideRefund('R-310', true).ok).toBe(true)
    as('T. Njeri')
    expect(api.admin.decideRefund('R-309', true)).toMatchObject({ ok: false, code: 'role' })
    expect(api.admin.userAction('u-QuietPine', 'restrict', 'Second strike for contact sharing').ok).toBe(true)
  })

  it('counts reveals for each reviewer separately', () => {
    as('T. Njeri')
    api.admin.reveal('C-1042', 'e2')
    as('A. Mwangi')
    expect(a().exposure['A. Mwangi']?.count ?? 0).toBe(0)
    api.admin.reveal('C-1042', 'e2')
    expect(a().exposure['A. Mwangi'].count).toBe(1)
    expect(a().exposure['T. Njeri'].count).toBe(4)
  })

  it('pauses revealing during a break, and the break ends by itself', () => {
    as('T. Njeri')
    api.team.startBreak()
    expect(a().exposure['T. Njeri'].sinceBreak).toBe(0)
    expect(api.admin.reveal('C-1042', 'e2')).toMatchObject({ ok: false, code: 'break' })
    advanceClock(11)
    expect(api.admin.reveal('C-1042', 'e2').ok).toBe(true)
  })

  it('applies a changed daily limit to reviewers', () => {
    expect(api.team.setWellbeing({ dailyLimit: 5, breakEvery: 3, breakMinutes: 10 }).ok).toBe(true)
    as('T. Njeri')
    expect(api.admin.reveal('C-1042', 'e0').ok).toBe(true)
    expect(api.admin.reveal('C-1042', 'e1').ok).toBe(true)
    expect(api.admin.reveal('C-1042', 'e2')).toMatchObject({ ok: false, code: 'limit' })
    as('T. Njeri')
    expect(api.team.setWellbeing({ dailyLimit: 50, breakEvery: 8, breakMinutes: 10 })).toMatchObject({ ok: false, code: 'role' })
  })

  it('keeps Severity-1 cases to the rota, and rotates it each week', () => {
    as('T. Njeri')
    expect(api.admin.claim('C-1049')).toMatchObject({ ok: false, code: 'rota' })
    expect(api.admin.claim('C-1040').ok).toBe(true)
    as('A. Mwangi')
    expect(api.admin.claim('C-1049').ok).toBe(true)
    as('Dr. K. Mwende')
    expect(api.admin.claim('C-1046').ok).toBe(true)
    // Next week the other moderator takes over.
    api.team.ensureRota()
    advanceClock(7 * 24 * 60)
    api.team.ensureRota()
    expect(api.team.currentRota()).toEqual(['T. Njeri'])
    as('T. Njeri')
    update((s) => ({ admin: { ...s.admin!, cases: s.admin!.cases.map((c) => (c.id === 'C-1049' ? { ...c, owner: null } : c)) } }))
    expect(api.admin.claim('C-1049').ok).toBe(true)
  })

  it('refuses a rota that keeps the same people two weeks running', () => {
    const next = a().rota[1].weekStart
    expect(api.team.setRota(next, ['A. Mwangi'])).toMatchObject({ ok: false, code: 'rotate' })
    expect(api.team.setRota(next, ['T. Njeri']).ok).toBe(true)
    expect(api.team.setRota(next, ['Nobody'])).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.team.setRota(next, [])).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('lets a reviewer hand a case on, and ask for support without giving a reason', () => {
    as('T. Njeri')
    expect(api.team.handOn('C-1042').ok).toBe(true)
    expect(a().cases.find((c) => c.id === 'C-1042')).toMatchObject({ owner: null, status: 'new' })
    expect(api.team.handOn('C-1042')).toMatchObject({ ok: false, code: 'owner' })
    api.team.askForSupport()
    expect(a().audit[0]).toMatchObject({ action: 'Asked for wellbeing support', reason: '' })
  })
})
