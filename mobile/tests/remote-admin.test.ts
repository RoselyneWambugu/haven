import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { adminRequestOtp, adminVerifyOtp, remoteAdmin, stopAdminPolling, syncAdmin } from '../src/backend/remoteAdmin'
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
