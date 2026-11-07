import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteConfig, syncAdminConfig, syncConfig } from '../src/backend/remoteConfig'
import { LIVE } from '../src/data/config'
import { DEFAULT_SESSION_MONEY, SESSION_MONEY } from '../src/lib/sessionMoney'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

const PLANS = [
  { id: 'daily', label: 'Daily', days: 1, priceKes: 120, enabled: true, entitlements: { disappearing: true, therapistDiscountPct: 5 } },
  { id: 'monthly', label: 'Monthly', days: 30, priceKes: null, enabled: false, entitlements: { disappearing: false, therapistDiscountPct: 15 } },
]
const APP = () => ({ ok: true, flags: { forum: false, moodCheckin: true, disappearing: true, therapistVideo: false }, limits: { graceDays: 3, penNameChangeDays: 10, deletionHoldDays: 20 }, topics: ['Anxiety', 'Grief', 'Work'], plans: PLANS })

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name in replies) return { data: replies[name], error: null }
      if (name === 'app_config') return { data: APP(), error: null }
      if (name === 'admin_config') return { data: { ...APP(), matching: { neighbourFallback: false, softTopicWeight: 0.5, rematchCooldownDays: 7 }, pendingPlans: null }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

beforeEach(() => {
  resetClock()
  update({ ...freshState() } as never)
})
afterEach(() => setClient(null))

describe('the session money numbers from the server', () => {
  it('are applied for everyone and for the Admin screen', async () => {
    fake({ app_config: { ...APP(), sessionMoney: { ...DEFAULT_SESSION_MONEY, lateCancelFeePct: 40, therapistWaitMinutes: 25 } } })
    await syncConfig()
    expect(getDb().content.sessionMoney.lateCancelFeePct).toBe(40)
    expect(SESSION_MONEY.lateCancelFeePct).toBe(40)
    expect(SESSION_MONEY.therapistWaitMinutes).toBe(25)
    fake({ admin_config: { ...APP(), matching: { neighbourFallback: false, softTopicWeight: 0.5, rematchCooldownDays: 7 }, sessionMoney: { ...DEFAULT_SESSION_MONEY, flakePauseAt: 4 } } })
    await syncAdminConfig()
    expect(getDb().content.sessionMoney.flakePauseAt).toBe(4)
    expect(SESSION_MONEY.lateCancelFeePct).toBe(10)
  })
})

describe('what members read', () => {
  it('takes the flags, limits, topics and plans from the server and keeps the wording the server doesn’t own', async () => {
    fake()
    const before = getDb().content.plans.find((p) => p.id === 'daily')!
    await syncConfig()
    const c = getDb().content
    expect(c.flags.forum).toBe(false)
    expect(c.limits.penNameChangeDays).toBe(10)
    expect(LIVE.penNameChangeDays).toBe(10)
    expect(c.topics).toEqual(['Anxiety', 'Grief', 'Work'])
    const daily = c.plans.find((p) => p.id === 'daily')!
    expect(daily.priceKes).toBe(120)
    expect(daily.period).toBe(before.period)
    expect(c.plans.find((p) => p.id === 'monthly')!.enabled).toBe(false)
  })

  it('keeps the built-in settings when the server can’t be reached', async () => {
    fake({ app_config: null })
    const flags = getDb().content.flags
    await syncConfig()
    expect(getDb().content.flags).toEqual(flags)
  })
})

describe('what an Admin does', () => {
  it('reads matching and a plan change waiting for approval', async () => {
    fake({ admin_config: { ...APP(), matching: { neighbourFallback: false, softTopicWeight: 0.5, rematchCooldownDays: 7 }, pendingPlans: { id: 'p1', plans: [{ id: 'daily', priceKes: 200 }], requestedBy: 'B. Admin', mine: false } } })
    await syncAdminConfig()
    const c = getDb().content
    expect(c.matching).toEqual({ neighbourFallback: false, softTopicWeight: 0.5, rematchCooldownDays: 7 })
    expect(c.pendingPlans).toMatchObject({ id: 'p1', mine: false, requestedBy: 'B. Admin' })
    expect(c.pendingPlans?.plans.find((p) => p.id === 'daily')?.priceKes).toBe(200)
  })

  it('reads the available languages, for members and for Admins', async () => {
    fake({ app_config: { ...APP(), languages: ['English', 'Kiswahili', 'Kikuyu'] } })
    await syncConfig()
    expect(getDb().content.languages).toEqual(['English', 'Kiswahili', 'Kikuyu'])
  })

  it('adds a language through the server and shows its reason when refused', async () => {
    const calls = fake({ admin_add_language: { ok: false, code: 'invalid', error: 'That language is already on the list.' } })
    expect(await remoteConfig.addLanguage('English')).toMatchObject({ ok: false, error: 'That language is already on the list.' })
    expect(calls[0]).toEqual({ name: 'admin_add_language', args: { p_name: 'English' } })
  })

  it('sends every change to the server', async () => {
    const calls = fake({ admin_propose_plans: { ok: true, proposed: true, id: 'p9' } })
    await remoteConfig.setFlag('forum', false)
    await remoteConfig.setLimits({ graceDays: 5, penNameChangeDays: 20, deletionHoldDays: 10 })
    await remoteConfig.setSessionMoney({ ...DEFAULT_SESSION_MONEY, lateCancelFeePct: 15 })
    await remoteConfig.setMatching({ neighbourFallback: true, softTopicWeight: 0.25, rematchCooldownDays: 14 })
    await remoteConfig.addTopic('Exams')
    await remoteConfig.renameTopic('Exams', 'Study')
    await remoteConfig.retireTopic('Study')
    const r = await remoteConfig.proposePlans(getDb().content.plans)
    expect(r).toEqual({ ok: true, value: { proposed: true } })
    const sent = calls.filter((c) => c.name !== 'admin_config').map((c) => [c.name, c.args])
    expect(sent.slice(0, 7)).toEqual([
      ['admin_set_flag', { p_key: 'forum', p_on: false }],
      ['admin_set_limits', { p_grace: 5, p_pen_name: 20, p_deletion: 10 }],
      ['admin_set_session_money', { p: { ...DEFAULT_SESSION_MONEY, lateCancelFeePct: 15 } }],
      ['admin_set_matching', { p_neighbours: true, p_weight: 0.25, p_cooldown: 14 }],
      ['admin_add_topic', { p_name: 'Exams' }],
      ['admin_rename_topic', { p_from: 'Exams', p_to: 'Study' }],
      ['admin_retire_topic', { p_name: 'Study' }],
    ])
    expect(calls.find((c) => c.name === 'admin_propose_plans')?.args?.p_plans).toHaveLength(getDb().content.plans.length)
  })

  it('approves and declines a plan change by its id', async () => {
    const calls = fake({ admin_config: { ...APP(), matching: { neighbourFallback: true, softTopicWeight: 0, rematchCooldownDays: 30 }, pendingPlans: { id: 'p1', plans: [], requestedBy: 'B', mine: false } } })
    update((s) => ({ content: { ...s.content, pendingPlans: { plans: s.content.plans, requestedBy: 'B', approvals: [], id: 'p1', mine: false } } }))
    await remoteConfig.approvePlans()
    await remoteConfig.declinePlans()
    expect(calls.filter((c) => c.name === 'admin_decide_plans').map((c) => c.args)).toEqual([{ p_id: 'p1', p_approve: true }, { p_id: 'p1', p_approve: false }])
  })

  it('passes the server’s refusals back', async () => {
    fake({ admin_set_limits: { ok: false, code: 'invalid', error: 'Grace period is 0 to 60 days.' } })
    expect(await remoteConfig.setLimits({ graceDays: 99, penNameChangeDays: 20, deletionHoldDays: 10 })).toMatchObject({ ok: false, code: 'invalid' })
  })
})
