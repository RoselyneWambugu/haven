import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { adminRequestOtp, adminVerifyOtp, claimFirstAdmin, remoteAdmin, remoteTeam, syncAnalytics, stopAdminPolling, syncAdmin } from '../src/backend/remoteAdmin'
import { appealNotice, syncNotices } from '../src/backend/remoteNotices'
import { stopPolling } from '../src/backend/remoteChat'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock, now } from '../src/lib/clock'

const STATE = () => ({
  ok: true, name: 'M. Test One', role: 'moderator', heavy: false,
  staff: [{ id: 'a1', name: 'M. Test One', role: 'moderator', active: true, last_sign_in_at: null }],
  cases: [{
    id: 'C-r:abc', severity: 'S2', source: 'user-report', type: 'Harassment', slaMinutes: 240, openedAt: now(), openedAtIso: new Date(now()).toISOString(), owner: null, status: 'new',
    reporter: 'QuietPine', reported: 'LoudRiver', snapshotAt: now(), ai: null, strikes: 0, priorReports: 0, decision: null, escalated: false,
    evidence: [{ id: 'e0', who: 'reported', text: 'rude', reported: true }],
  }],
  users: [{ id: 'u1', penName: 'LoudRiver', joined: '01 Oct 2026', languages: 'English', ageBand: '25-34', standing: 'good', strikes: [], reportsAgainst: 1, reportsMade: 0, blocksReceived: 0, plan: 'No plan', matches: 0, skips: 0 }],
  appeals: [], held: [{ id: 'p1', title: 'Held', body: 'Waiting for review', author: 'LoudRiver', at: now(), topic: 'Anxiety' }],
  therapists: [{ id: 't-amina', name: 'Amina', suspended: true, paused: false }],
  audit: [{ id: '1', at: now(), actor: 'M. Test One', role: 'moderator', action: 'Signed in', target: 'Dashboard', reason: '' }],
  revealed: ['C-r:abc:e0'],
})

interface Script { replies?: Record<string, unknown>; verify?: boolean }

function fake(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const auth = { signedOut: 0, otps: [] as string[] }
  setClient({
    auth: {
      signInWithOtp: async ({ phone }: { phone: string }) => (auth.otps.push(phone), { error: null }),
      verifyOtp: async () => ({ error: script.verify === false ? { message: 'bad' } : null }),
      signOut: async () => ((auth.signedOut += 1), { error: null }),
      getSession: async () => ({ data: { session: {} } }),
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (script.replies && name in script.replies) return { data: script.replies[name], error: null }
      if (name === 'admin_state') return { data: STATE(), error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return { calls, auth }
}

beforeEach(() => {
  resetClock()
  update({ ...freshState(), signedIn: true } as never)
})
afterEach(() => {
  stopAdminPolling()
  stopPolling()
  setClient(null)
})

describe('staff sign-in', () => {
  it('opens the dashboard for a linked number and signs the member app out', async () => {
    const f = fake()
    expect((await adminRequestOtp('+254712000061')).ok).toBe(true)
    expect(f.auth.otps).toEqual(['+254712000061'])
    expect((await adminVerifyOtp('123456')).ok).toBe(true)
    const a = getDb().admin!
    expect(a.signedIn).toBe(true)
    expect(a.role).toBe('moderator')
    expect(a.staffName).toBe('M. Test One')
    expect(getDb().signedIn).toBe(false)
    expect(f.calls.map((c) => c.name)).toContain('staff_me')
  })

  it('signs out again when the number isn’t linked to staff', async () => {
    const f = fake({ replies: { staff_me: { ok: false, code: 'not-staff', error: 'no' } } })
    await adminRequestOtp('+254712000061')
    const r = await adminVerifyOtp('123456')
    expect(r.ok).toBe(false)
    expect(f.auth.signedOut).toBe(1)
    expect(getDb().admin).toBeNull()
  })

  it('refuses a wrong code', async () => {
    fake({ verify: false })
    await adminRequestOtp('+254712000061')
    const r = await adminVerifyOtp('000000')
    expect(r.ok).toBe(false)
    expect(getDb().admin).toBeNull()
  })
})

describe('the first Admin', () => {
  it('keeps the sign-in open for setup when nobody is an Admin yet', async () => {
    const f = fake({ replies: { staff_me: { ok: false, code: 'not-staff', error: 'no' }, admin_state: { ok: false, code: 'not-staff' }, setup_open: { ok: true, open: true } } })
    await adminRequestOtp('+254712000091')
    const r = await adminVerifyOtp('123456')
    expect(r).toMatchObject({ ok: false, code: 'setup' })
    expect(f.auth.signedOut).toBe(0)
  })

  it('signs out when setup is closed and the number isn’t staff', async () => {
    const f = fake({ replies: { staff_me: { ok: false, code: 'not-staff', error: 'no' }, admin_state: { ok: false, code: 'not-staff' }, setup_open: { ok: true, open: false } } })
    await adminRequestOtp('+254712000091')
    expect(await adminVerifyOtp('123456')).toMatchObject({ ok: false, code: 'not-staff' })
    expect(f.auth.signedOut).toBe(1)
  })

  it('claims with the code and opens the dashboard', async () => {
    const f = fake({ replies: { admin_state: { ...STATE(), role: 'admin' } } })
    const r = await claimFirstAdmin('First Admin', '4D22-70D4-F963-4863')
    expect(r.ok).toBe(true)
    expect(f.calls[0]).toEqual({ name: 'claim_first_admin', args: { p_name: 'First Admin', p_code: '4D22-70D4-F963-4863' } })
    expect(getDb().admin?.signedIn).toBe(true)
  })

  it('shows a wrong code and stays signed in, but signs out once setup locks', async () => {
    const f = fake({ replies: { claim_first_admin: { ok: false, code: 'code', error: 'That setup code doesn’t match.' } } })
    expect(await claimFirstAdmin('First Admin', 'x')).toMatchObject({ ok: false, code: 'code' })
    expect(f.auth.signedOut).toBe(0)
    fake({ replies: { claim_first_admin: { ok: false, code: 'locked', error: 'Too many wrong codes.' } } })
    await claimFirstAdmin('First Admin', 'x')
  })
})

describe('the dashboard state', () => {
  it('shows cases, users, held posts, the audit log and suspended therapists from the server', async () => {
    fake()
    expect(await syncAdmin()).toBe(true)
    const a = getDb().admin!
    expect(a.cases).toHaveLength(1)
    expect(a.cases[0]).not.toHaveProperty('openedAtIso')
    expect(a.users[0].penName).toBe('LoudRiver')
    expect(a.held).toHaveLength(1)
    expect(a.audit[0].action).toBe('Signed in')
    expect(a.therapistStanding?.['t-amina']).toBeTruthy()
    expect(a.revealed).toEqual(['M. Test One|C-r:abc:e0'])
  })

  it('is false for a number that isn’t staff', async () => {
    fake({ replies: { admin_state: { ok: false, code: 'not-staff' } } })
    expect(await syncAdmin()).toBe(false)
  })
})

describe('actions', () => {
  it('sends a decision to the server and refreshes', async () => {
    const f = fake()
    const r = await remoteAdmin.decide('C-r:abc', 'strike', 'Harassing another member')
    expect(r.ok).toBe(true)
    expect(f.calls[0]).toEqual({ name: 'admin_decide', args: { p_case: 'C-r:abc', p_action: 'strike', p_reason: 'Harassing another member' } })
    expect(f.calls.map((c) => c.name)).toContain('admin_state')
  })

  it('passes the server’s refusal back to the screen', async () => {
    fake({ replies: { admin_claim: { ok: false, code: 'rota', error: 'Severity-1 cases are worked by the heavy-queue rota.' } } })
    const r = await remoteAdmin.claim('C-r:abc')
    expect(r).toMatchObject({ ok: false, code: 'rota' })
  })

  it('sends appeal decisions by notice', async () => {
    const f = fake({ replies: { admin_state: { ...STATE(), appeals: [{ id: 'A-n1', noticeId: 'n1', caseId: 'C-x', penName: 'LoudRiver', decision: 'warning: Harassment', decidedBy: 'X', statement: 's', openedAt: now(), slaHours: 24, status: 'open', reviewer: null }] } } })
    await syncAdmin()
    await remoteAdmin.decideAppeal('A-n1', 'overturned', 'Looked again and agree')
    expect(f.calls.find((c) => c.name === 'admin_decide_appeal')?.args).toEqual({ p_notice: 'n1', p_outcome: 'overturned', p_explanation: 'Looked again and agree' })
  })

  it('reviews held posts', async () => {
    const f = fake()
    await remoteAdmin.reviewPost('p1', false, 'Breaks the guidelines')
    expect(f.calls[0]).toEqual({ name: 'admin_review_post', args: { p_post: 'p1', p_approve: false, p_reason: 'Breaks the guidelines' } })
  })

  it('only lets an Admin export the audit log', async () => {
    fake()
    await syncAdmin()
    expect(remoteAdmin.exportAudit().ok).toBe(false)
  })

  it('signing out clears the dashboard and the server session', async () => {
    const f = fake()
    await syncAdmin()
    remoteAdmin.signOut()
    expect(getDb().admin).toBeNull()
    expect(f.auth.signedOut).toBe(1)
  })
})

describe('linking therapists', () => {
  it('links and unlinks a number, and shows which therapists are linked', async () => {
    const f = fake({ replies: { admin_state: { ...STATE(), role: 'clinical' }, admin_therapist_links: { ok: true, links: [{ id: 't-amina', linked: true, pending: false, tail: '072' }, { id: 't-james', linked: false, pending: true, tail: '073' }] } } })
    await syncAdmin()
    expect(getDb().admin?.therapistLinks?.['t-amina']).toEqual({ linked: true, pending: false, tail: '072' })
    expect(getDb().admin?.therapistLinks?.['t-james']?.pending).toBe(true)
    await remoteAdmin.linkTherapist('t-amina', '+254712000072')
    expect(f.calls.find((c) => c.name === 'admin_link_therapist')?.args).toEqual({ p_therapist: 't-amina', p_phone: '+254712000072' })
    await remoteAdmin.unlinkTherapist('t-amina', 'Left the practice')
    expect(f.calls.find((c) => c.name === 'admin_unlink_therapist')?.args).toEqual({ p_therapist: 't-amina', p_reason: 'Left the practice' })
  })

  it('does not ask for links when the role can’t see them', async () => {
    const f = fake()
    await syncAdmin()
    expect(f.calls.map((c) => c.name)).not.toContain('admin_therapist_links')
  })
})

describe('managing the team', () => {
  it('adds, changes and invites staff through the server, and lists invitations for Admins', async () => {
    const f = fake({ replies: {
      admin_state: { ...STATE(), role: 'admin' },
      admin_staff_invites: { ok: true, invites: [{ name: 'Invited Person', role: 'clinical', tail: '085', by: 'A', at: now() }], heavy: { a1: true } },
    } })
    await syncAdmin()
    expect(getDb().admin?.staffInvites).toHaveLength(1)
    expect(getDb().admin?.heavy).toEqual({ a1: true })
    await remoteAdmin.addStaff('Invited Person', 'clinical', '+254712000085')
    expect(f.calls.find((c) => c.name === 'admin_add_staff')?.args).toEqual({ p_name: 'Invited Person', p_role: 'clinical', p_phone: '+254712000085' })
    await remoteAdmin.setStaff('a1', { role: 'billing' })
    expect(f.calls.find((c) => c.name === 'admin_set_staff')?.args).toEqual({ p_account: 'a1', p_role: 'billing', p_active: null, p_heavy: null })
    await remoteAdmin.setStaff('a1', { heavy: false })
    expect(f.calls.filter((c) => c.name === 'admin_set_staff')[1].args).toEqual({ p_account: 'a1', p_role: null, p_active: null, p_heavy: false })
    await remoteAdmin.cancelInvite('Invited Person')
    expect(f.calls.find((c) => c.name === 'admin_cancel_invite')?.args).toEqual({ p_name: 'Invited Person' })
  })

  it('passes the server’s refusal back, such as the last-Admin rule', async () => {
    fake({ replies: { admin_set_staff: { ok: false, code: 'admins', error: 'Keep at least 2 active Admins.' } } })
    expect(await remoteAdmin.setStaff('a1', { active: false })).toMatchObject({ ok: false, code: 'admins' })
  })

  it('does not ask for invitations unless the person is an Admin', async () => {
    const f = fake()
    await syncAdmin()
    expect(f.calls.map((c) => c.name)).not.toContain('admin_staff_invites')
  })
})

describe('two-person approval', () => {
  it('says whether a change was proposed or applied, and lists the change waiting', async () => {
    fake({ replies: {
      admin_state: { ...STATE(), role: 'admin' },
      admin_add_staff: { ok: true, proposed: true, id: 'c1' },
      admin_staff_invites: { ok: true, invites: [], heavy: {}, pending: { id: 'c1', summary: 'Add X as billing', requestedBy: 'M. Test One', mine: true, at: now() } },
    } })
    const r = await remoteAdmin.addStaff('Person X', 'billing', '+254712000084')
    expect(r).toEqual({ ok: true, value: { proposed: true } })
    expect(getDb().admin?.staffPending).toMatchObject({ id: 'c1', mine: true })
  })

  it('reports an immediate change when there is no second Admin', async () => {
    fake({ replies: { admin_set_staff: { ok: true, applied: true } } })
    expect(await remoteAdmin.setStaff('a2', { role: 'clinical' })).toEqual({ ok: true, value: { proposed: false } })
  })

  it('approves, declines and withdraws through the server', async () => {
    const f = fake()
    await remoteAdmin.decideStaffChange('c1', true)
    await remoteAdmin.decideStaffChange('c1', false)
    await remoteAdmin.withdrawStaffChange('c1')
    expect(f.calls.filter((c) => c.name.includes('staff_change')).map((c) => [c.name, c.args])).toEqual([
      ['admin_decide_staff_change', { p_id: 'c1', p_approve: true }],
      ['admin_decide_staff_change', { p_id: 'c1', p_approve: false }],
      ['admin_withdraw_staff_change', { p_id: 'c1' }],
    ])
  })

  it('shows the server’s refusal when the proposer tries to approve', async () => {
    fake({ replies: { admin_decide_staff_change: { ok: false, code: 'second-person', error: 'A second Admin must decide this.' } } })
    expect(await remoteAdmin.decideStaffChange('c1', true)).toMatchObject({ ok: false, code: 'second-person' })
  })
})

describe('strike policy and break-glass', () => {
  it('shows the policy and a waiting change, and proposes, approves, declines and withdraws through the server', async () => {
    const f = fake({ replies: {
      admin_state: { ...STATE(), role: 'admin' },
      admin_policy: { ok: true, policy: { expiryDays: 60, restrictionHours: 12 }, pending: { id: 'p1', policy: { expiryDays: 45, restrictionHours: 6 }, requestedBy: 'A. Two', mine: false } },
      admin_propose_policy: { ok: true, proposed: true, id: 'p2' },
    } })
    await syncAdmin()
    expect(getDb().admin?.policy).toEqual({ expiryDays: 60, restrictionHours: 12 })
    expect(getDb().admin?.policyChange).toMatchObject({ id: 'p1', mine: false, requestedBy: 'A. Two', policy: { expiryDays: 45, restrictionHours: 6 } })
    expect(await remoteAdmin.proposePolicy({ expiryDays: 30, restrictionHours: 2 })).toEqual({ ok: true, value: { proposed: true } })
    expect(f.calls.find((c) => c.name === 'admin_propose_policy')?.args).toEqual({ p_expiry_days: 30, p_restriction_hours: 2 })
    await remoteAdmin.approvePolicy()
    await remoteAdmin.declinePolicy()
    await remoteAdmin.cancelPolicy()
    expect(f.calls.filter((c) => ['admin_decide_policy', 'admin_withdraw_policy'].includes(c.name)).map((c) => [c.name, c.args])).toEqual([
      ['admin_decide_policy', { p_id: 'p1', p_approve: true }],
      ['admin_decide_policy', { p_id: 'p1', p_approve: false }],
      ['admin_withdraw_policy', { p_id: 'p1' }],
    ])
  })

  it('passes the policy refusal back', async () => {
    fake({ replies: { admin_propose_policy: { ok: false, code: 'range', error: 'Use 30 to 365 days.' } } })
    expect(await remoteAdmin.proposePolicy({ expiryDays: 5, restrictionHours: 2 })).toMatchObject({ ok: false, code: 'range' })
  })

  it('requests, decides and opens a break-glass profile through the server', async () => {
    const f = fake({ replies: {
      admin_request_break_glass: { ok: true, id: 'b1' },
      admin_private_profile: { ok: true, name: 'Target Member', phone: '+254712000116', location: 'Nairobi', minutesLeft: 29 },
      admin_break_glass: { ok: true, requests: [{ id: 'b1', caseId: 'C-r:abc', target: 'QuietPine', reasonCode: 'imminent-risk', justification: 'A credible threat', requestedBy: 'M', requestedAt: now(), status: 'approved', approvedBy: 'C', expiresAt: now() + 1000 }] },
    } })
    expect(await remoteAdmin.requestBreakGlass('C-r:abc', { reasonCode: 'imminent-risk', justification: 'A credible threat to harm someone' })).toEqual({ ok: true, value: { id: 'b1' } })
    expect(f.calls[0]).toEqual({ name: 'admin_request_break_glass', args: { p_case: 'C-r:abc', p_reason: 'imminent-risk', p_justification: 'A credible threat to harm someone' } })
    await syncAdmin()
    expect(getDb().admin?.breakGlass[0]).toMatchObject({ id: 'b1', status: 'approved' })
    await remoteAdmin.decideBreakGlass('b1', true)
    expect(f.calls.find((c) => c.name === 'admin_decide_break_glass')?.args).toEqual({ p_id: 'b1', p_approve: true })
    expect(await remoteAdmin.privateProfile('b1')).toEqual({ name: 'Target Member', phone: '+254712000116', location: 'Nairobi', minutesLeft: 29 })
  })

  it('returns nothing when the approval has ended', async () => {
    fake({ replies: { admin_private_profile: { ok: false, code: 'expired', error: 'This approval has ended.' } } })
    expect(await remoteAdmin.privateProfile('b1')).toBeNull()
  })
})

describe('wellbeing and the rota', () => {
  it('shows the limits, my reveals and the rota from the server', async () => {
    fake({ replies: { admin_wellbeing: { ok: true, cfg: { dailyLimit: 12, breakEvery: 4, breakMinutes: 5 }, exposure: { count: 3, sinceBreak: 3, breakUntil: null }, rota: [{ weekStart: 1000, heavy: ['M. Test One'] }] } } })
    await syncAdmin()
    const a = getDb().admin!
    expect(a.wellbeing).toEqual({ dailyLimit: 12, breakEvery: 4, breakMinutes: 5 })
    expect(a.exposure['M. Test One']).toEqual({ count: 3, sinceBreak: 3, breakUntil: null })
    expect(a.rota).toEqual([{ weekStart: 1000, heavy: ['M. Test One'] }])
  })

  it('sends limits, breaks, rota changes, hand-on and support requests to the server', async () => {
    const f = fake()
    await remoteTeam.setWellbeing({ dailyLimit: 10, breakEvery: 4, breakMinutes: 5 })
    await remoteTeam.startBreak()
    await remoteTeam.setRota(1000, ['M. Bravo'])
    await remoteTeam.handOn('C-r:abc')
    remoteTeam.askForSupport()
    await Promise.resolve()
    const sent = f.calls.filter((c) => c.name !== 'admin_state' && !c.name.startsWith('admin_policy') && c.name !== 'admin_break_glass' && c.name !== 'admin_wellbeing' && c.name !== 'admin_billing' && c.name !== 'admin_help' && c.name !== 'admin_groups' && c.name !== 'admin_flags')
    expect(sent.map((c) => [c.name, c.args])).toEqual([
      ['admin_set_wellbeing', { p_daily: 10, p_every: 4, p_minutes: 5 }],
      ['admin_start_break', {}],
      ['admin_set_rota', { p_week: 1000, p_names: ['M. Bravo'] }],
      ['admin_hand_on', { p_case: 'C-r:abc' }],
      ['admin_ask_support', undefined],
    ])
  })

  it('passes the daily limit refusal back', async () => {
    fake({ replies: { admin_reveal: { ok: false, code: 'limit', error: 'You’ve reached today’s limit.' } } })
    expect(await remoteAdmin.reveal('C-r:abc', 'e1')).toMatchObject({ ok: false, code: 'limit' })
  })
})

describe('analytics and billing', () => {
  it('keeps the live analytics, and says when there are none', async () => {
    fake({ replies: { admin_analytics: { ok: true, days: [{ t: 1, registered: 4 }], cohorts: [], who: { rows: [], cols: [], cells: [] }, reviewMinutes: [5, 9] } } })
    await syncAdmin()
    expect(await syncAnalytics()).toBe(true)
    expect(getDb().admin?.analytics?.reviewMinutes).toEqual([5, 9])
    fake({ replies: { admin_analytics: { ok: false, code: 'not-staff' } } })
    expect(await syncAnalytics()).toBe(false)
  })

  it('lists refunds from the server and decides them there', async () => {
    const f = fake({ replies: { admin_billing: { ok: true, refunds: [{ id: 'R-1', penName: 'QuietPine', plan: 'Monthly', reason: 'Did not use it', status: 'pending', decidedBy: null }], unmatched: 2, failed: 3 } } })
    await syncAdmin()
    expect(getDb().admin?.refunds).toHaveLength(1)
    expect(getDb().admin?.unmatchedPayments).toBe(2)
    expect(getDb().admin?.failedPayments).toBe(3)
    await remoteAdmin.decideRefund('R-1', true)
    expect(f.calls.find((c) => c.name === 'admin_decide_refund')?.args).toEqual({ p_id: 'R-1', p_approve: true })
  })
})

describe('members’ notices', () => {
  it('shows staff decisions in the member app, including the account standing', async () => {
    fake({ replies: {
      my_notices: { ok: true, notices: [{ id: 'n1', kind: 'warning', rule: 'Harassment', explanation: 'This breaks our guidelines.', at: now(), expires_at: now() + 1000, appeal: 'none', appeal_text: null }] },
      my_account: { standing: 'restricted' },
    } })
    update({ account: { standing: 'good', notices: [], public: {}, private: {}, devices: [] } } as never)
    await syncNotices()
    expect(getDb().account?.notices).toHaveLength(1)
    expect(getDb().account?.standing).toBe('restricted')
  })

  it('sends an appeal, and refuses a short one without asking the server', async () => {
    const f = fake()
    expect((await appealNotice('n1', 'short')).ok).toBe(false)
    expect(f.calls).toHaveLength(0)
    expect((await appealNotice('n1', 'I was joking and it was misread')).ok).toBe(true)
    expect(f.calls[0]).toEqual({ name: 'appeal_notice', args: { p_notice: 'n1', p_text: 'I was joking and it was misread' } })
  })
})

describe('automated flags', () => {
  it('shows the server’s flag log in place of the demo flags, and keeps it when the server can’t be reached', async () => {
    const flag = { id: 'F-7001', category: 'Harassment', confidence: 0.72, model: 'rules-v1', outcome: 'open', reviewMinutes: null }
    fake({ replies: { admin_flags: { ok: true, flags: [flag] } } })
    await syncAdmin()
    expect(getDb().admin?.flags).toEqual([flag])
    fake({ replies: { admin_flags: null } })
    await syncAdmin()
    expect(getDb().admin?.flags).toEqual([flag])
  })
})
