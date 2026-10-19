import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { canAccess, canApprove, canExportAudit, canReveal, filterCases, flagMetrics, minutesLeft, nextSanction, policyApproved, slaLabel, sortCases, validateBreakGlass } from '../src/lib/admin'
import { advanceClock, resetClock } from '../src/lib/clock'
import { freshState, getDb, update } from '../src/store/db'

describe('roles and modules', () => {
  it('shows each role only its own modules', () => {
    expect(canAccess('billing', 'billing')).toBe(true)
    expect(canAccess('billing', 'cases')).toBe(false)
    expect(canAccess('moderator', 'billing')).toBe(false)
    expect(canAccess('clinical', 'therapists')).toBe(true)
    expect(canAccess('moderator', 'therapists')).toBe(false)
  })
  it('lets only an Admin export the audit log', () => {
    expect(canExportAudit('admin')).toBe(true)
    expect(canExportAudit('clinical')).toBe(false)
  })
})

describe('case queue', () => {
  const base = { openedAt: 0, status: 'new' as const }
  it('sorts by severity, then by least time left, with closed cases last', () => {
    const list = sortCases(
      [
        { id: 'a', severity: 'S2' as const, slaMinutes: 10, ...base },
        { id: 'b', severity: 'S1' as const, slaMinutes: 50, ...base },
        { id: 'c', severity: 'S1' as const, slaMinutes: 5, ...base },
        { id: 'd', severity: 'S1' as const, slaMinutes: 1, openedAt: 0, status: 'closed' as const },
      ],
      0,
    )
    expect(list.map((x) => x.id)).toEqual(['c', 'b', 'a', 'd'])
  })
  it('counts the SLA clock down and flags a breach', () => {
    expect(minutesLeft({ slaMinutes: 100, openedAt: 0 }, 40 * 60_000)).toBe(60)
    expect(slaLabel(60)).toEqual({ text: '1:00', breached: false })
    expect(slaLabel(-5)).toEqual({ text: '-0:05', breached: true })
  })
  it('filters the queue', () => {
    const mk = (id: string, p: object) => ({ id, severity: 'S2', source: 'user-report', owner: null, status: 'new', reporter: 'x', reported: 'y', ...p }) as never
    const cases = [mk('1', { severity: 'S1' }), mk('2', { source: 'crisis-flag' }), mk('3', { owner: 'me' }), mk('4', { status: 'closed' })]
    expect(filterCases(cases, 'all', 'me').length).toBe(3)
    expect(filterCases(cases, 'S1', 'me').map((c) => c.id)).toEqual(['1'])
    expect(filterCases(cases, 'mine', 'me').map((c) => c.id)).toEqual(['3'])
    expect(filterCases(cases, 'unassigned', 'me').map((c) => c.id)).toEqual(['1', '2'])
  })
})

describe('safeguards', () => {
  it('limits daily reveals', () => {
    expect(canReveal(19)).toBe(true)
    expect(canReveal(20)).toBe(false)
  })
  it('needs a justification and a different approver for break-glass', () => {
    expect(validateBreakGlass('too short')).not.toBeNull()
    expect(validateBreakGlass('Client said they have a plan tonight')).toBeNull()
    expect(canApprove('A. Mwangi', 'A. Mwangi', 'clinical')).toBe(false)
    expect(canApprove('A. Mwangi', 'Dr. K. Mwende', 'moderator')).toBe(false)
    expect(canApprove('A. Mwangi', 'Dr. K. Mwende', 'clinical')).toBe(true)
  })
  it('needs a second admin for a policy change', () => {
    expect(policyApproved('S. Kamau', [])).toBe(false)
    expect(policyApproved('S. Kamau', ['S. Kamau'])).toBe(false)
    expect(policyApproved('S. Kamau', ['R. Achieng'])).toBe(true)
  })
  it('follows the strike ladder', () => {
    expect(nextSanction(0, 'S3')).toBe('warning')
    expect(nextSanction(1, 'S2')).toBe('restriction')
    expect(nextSanction(2, 'S2')).toBe('suspension')
    expect(nextSanction(0, 'S1')).toBe('suspension')
  })
  it('measures the AI from reviewed flags only', () => {
    const m = flagMetrics([
      { outcome: 'upheld', reviewMinutes: 10 },
      { outcome: 'upheld', reviewMinutes: 20 },
      { outcome: 'overturned', reviewMinutes: 30 },
      { outcome: 'open', reviewMinutes: null },
    ])
    expect(m.precision).toBeCloseTo(2 / 3)
    expect(m.overturnRate).toBeCloseTo(1 / 3)
    expect(m.medianMinutes).toBe(20)
    expect(flagMetrics([]).precision).toBeNull()
  })
})

function registerMember() {
  api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
  api.auth.acceptConsents()
  const otp = api.auth.requestOtp('register')
  if (!otp.ok) throw new Error('otp')
  api.auth.verifyOtp(otp.value.demoCode)
  api.auth.saveProfileDraft({ penName: 'BrightFern', avatar: 'moon', languages: ['English'] })
  api.auth.completeRegistration('web')
}
const as = (name: string) => expect(api.admin.signIn(name, DEMO_MFA).ok).toBe(true)
const a = () => getDb().admin!

describe('admin api', () => {
  beforeEach(() => {
    resetClock()
    update(freshState())
    as('T. Njeri')
  })

  it('needs a staff identity and the MFA code', () => {
    update(freshState())
    expect(api.admin.signIn('Nobody', DEMO_MFA).ok).toBe(false)
    expect(api.admin.signIn('T. Njeri', '000000')).toMatchObject({ ok: false, code: 'mfa' })
  })

  it('records opening a case and revealing a message in the audit log', () => {
    api.admin.view('C-1042')
    expect(api.admin.reveal('C-1042', 'e2').ok).toBe(true)
    const actions = a().audit.map((x) => x.action)
    expect(actions).toContain('Viewed case content')
    expect(actions).toContain('Revealed message')
    expect(a().revealsToday).toBe(4)
  })

  it('counts a message once however often it is revealed', () => {
    api.admin.reveal('C-1042', 'e2')
    api.admin.reveal('C-1042', 'e2')
    expect(a().revealsToday).toBe(4)
  })

  it('stops reveals at the daily limit', () => {
    for (let i = 0; i < 17; i++) api.admin.reveal('C-1042', `x${i}`)
    expect(a().revealsToday).toBe(20)
    expect(api.admin.reveal('C-1042', 'one-more')).toMatchObject({ ok: false, code: 'limit' })
  })

  it('needs a reason for every decision', () => {
    expect(api.admin.decide('C-1042', 'strike', '')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.admin.decide('C-1042', 'dismiss', 'No violation found').ok).toBe(true)
    expect(a().cases.find((c) => c.id === 'C-1042')!.status).toBe('closed')
  })

  it('escalating hands the case on and keeps it open', () => {
    api.admin.decide('C-1049', 'escalate', 'Needs the clinical lead')
    const c = a().cases.find((x) => x.id === 'C-1049')!
    expect(c).toMatchObject({ escalated: true, status: 'waiting', owner: null })
  })

  it('turns a member report into a case', () => {
    registerMember()
    api.report.submit({ target: 'member', targetId: 'p-rainy', reason: 'threats', note: 'They threatened me' })
    api.admin.syncReports()
    const c = a().cases.find((x) => x.id.startsWith('C-r'))!
    expect(c).toBeTruthy()
    expect(c.severity).toBe('S1')
    api.admin.syncReports()
    expect(a().cases.filter((x) => x.id === c.id).length).toBe(1)
  })

  it('applies a suspension to the real member and pauses the account', () => {
    registerMember()
    api.admin.userAction('member', 'suspend', 'Repeated harassment').valueOf()
    expect(getDb().account!.standing).toBe('paused')
    expect(getDb().account!.notices[0].kind).toBe('suspension')
    api.admin.userAction('member', 'restore', 'Reviewed and cleared')
    expect(getDb().account!.standing).toBe('good')
  })

  it('needs a second person, the clinical lead, to approve break-glass', () => {
    const r = api.admin.requestBreakGlass('C-1042', { reasonCode: 'imminent-risk', justification: 'Said they plan to hurt themselves tonight' })
    if (!r.ok) throw new Error('request')
    expect(api.admin.decideBreakGlass(r.value.id, true)).toMatchObject({ ok: false, code: 'second-person' })
    expect(api.admin.privateProfile(r.value.id)).toBeNull()
    as('Dr. K. Mwende')
    expect(api.admin.decideBreakGlass(r.value.id, true).ok).toBe(true)
    expect(api.admin.privateProfile(r.value.id)).toMatchObject({ minutesLeft: 30 })
  })

  it('closes the break-glass window after 30 minutes', () => {
    const r = api.admin.requestBreakGlass('C-1042', { reasonCode: 'legal', justification: 'Court order reference 2026/118 attached' })
    if (!r.ok) throw new Error('request')
    as('Dr. K. Mwende')
    api.admin.decideBreakGlass(r.value.id, true)
    advanceClock(31)
    expect(api.admin.privateProfile(r.value.id)).toBeNull()
  })

  it('logs requests and approvals as separate entries', () => {
    const r = api.admin.requestBreakGlass('C-1042', { reasonCode: 'fraud', justification: 'Looks like an organised scam ring' })
    if (!r.ok) throw new Error('request')
    as('Dr. K. Mwende')
    api.admin.decideBreakGlass(r.value.id, true)
    const actions = a().audit.map((x) => x.action)
    expect(actions).toContain('Break-glass requested')
    expect(actions).toContain('Break-glass approved')
  })

  it('refuses a break-glass request with no real justification', () => {
    expect(api.admin.requestBreakGlass('C-1042', { reasonCode: 'fraud', justification: 'because' })).toMatchObject({ ok: false, code: 'justification' })
  })

  it('does not let the original decision-maker decide an appeal', () => {
    expect(api.admin.decideAppeal('A-221', 'overturned', 'Context shows they were quoting.')).toMatchObject({ ok: false, code: 'same-reviewer' })
    as('A. Mwangi')
    expect(api.admin.decideAppeal('A-221', 'overturned', 'Context shows they were quoting.').ok).toBe(true)
    expect(api.admin.appeals().find((x) => x.id === 'A-221')!.status).toBe('overturned')
  })

  it('decides a member appeal and changes the member app', () => {
    registerMember()
    api.demo.addNotice()
    const notice = getDb().account!.notices[0]
    api.account.appeal(notice.id, 'I was only quoting what they sent me')
    as('A. Mwangi')
    const ap = api.admin.appeals().find((x) => x.noticeId === notice.id)!
    expect(ap.status).toBe('open')
    expect(api.admin.decideAppeal(ap.id, 'overturned', 'The context shows no violation.').ok).toBe(true)
    expect(getDb().account!.notices[0].appeal).toBe('overturned')
  })

  it('only billing and admin staff decide refunds', () => {
    expect(api.admin.decideRefund('R-310', true)).toMatchObject({ ok: false, code: 'role' })
    as('J. Otieno')
    expect(api.admin.decideRefund('R-310', true).ok).toBe(true)
    expect(api.admin.decideRefund('R-310', false).ok).toBe(false)
    expect(a().audit[0].action).toBe('Approved refund')
  })

  it('needs every check ticked before approving a therapist, and a message', () => {
    as('Dr. K. Mwende')
    const none = { name: false, licence: false, expiry: false, qualification: false }
    const all = { name: true, licence: true, expiry: true, qualification: true }
    expect(api.admin.verify('T-88', 'approved', 'Welcome to Echo.', none)).toMatchObject({ ok: false, code: 'checklist' })
    expect(api.admin.verify('T-88', 'info', '', none)).toMatchObject({ ok: false, code: 'message' })
    expect(api.admin.verify('T-88', 'approved', 'Welcome to Echo.', all).ok).toBe(true)
  })

  it('moves a portal applicant forward when staff decide', () => {
    api.portal.submitApplication()
    as('Dr. K. Mwende')
    expect(api.admin.applicants().some((x) => x.id === 'T-portal')).toBe(true)
    api.admin.verify('T-portal', 'info', 'Please upload a clearer licence copy.', { name: true, licence: false, expiry: false, qualification: true })
    expect(getDb().portal!.application).toBe('more-info')
  })

  it('needs two different admins to change the strike policy', () => {
    expect(api.admin.proposePolicy({ expiryDays: 60, restrictionHours: 48 })).toMatchObject({ ok: false, code: 'role' })
    as('S. Kamau')
    expect(api.admin.proposePolicy({ expiryDays: 60, restrictionHours: 48 }).ok).toBe(true)
    expect(api.admin.approvePolicy()).toMatchObject({ ok: false, code: 'second-person' })
    expect(a().policy.expiryDays).toBe(90)
    as('R. Achieng')
    expect(api.admin.approvePolicy().ok).toBe(true)
    expect(a().policy).toEqual({ expiryDays: 60, restrictionHours: 48 })
  })

  it('rejects out-of-range policy values', () => {
    as('S. Kamau')
    expect(api.admin.proposePolicy({ expiryDays: 5, restrictionHours: 24 })).toMatchObject({ ok: false, code: 'range' })
  })

  it('lets only an Admin export data and the audit log, and logs it', () => {
    expect(api.admin.exportAudit()).toMatchObject({ ok: false, code: 'role' })
    expect(api.admin.exportUser('u-QuietPine')).toMatchObject({ ok: false, code: 'role' })
    as('S. Kamau')
    expect(api.admin.exportAudit().ok).toBe(true)
    expect(api.admin.exportUser('u-QuietPine').ok).toBe(true)
    const actions = a().audit.map((x) => x.action)
    expect(actions).toContain('Exported audit log')
    expect(actions).toContain('Exported data')
  })
})
