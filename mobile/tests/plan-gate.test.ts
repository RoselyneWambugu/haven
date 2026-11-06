import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { THERAPISTS } from '../src/data/seed'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { slotsFor } from '../src/lib/directory'
import { daysLeft, daysLeftLabel, FREE_ITEMS, perDayKes, periodUsed, planIncludes, savingVsDaily } from '../src/lib/plan'
import type { PlanCfg } from '../src/api/types'
import { freshState, getDb, update } from '../src/store/db'

const BODY = 'Some days are harder than others and I wanted to say so.'

describe('the whole platform needs a paid plan', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
    api.auth.acceptConsents()
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
    api.auth.completeRegistration('web')
    api.spaces.ensureSeeds()
    api.groups.ensure()
  })

  it('refuses the community without a plan, then allows it with one', () => {
    expect(api.forum.create({ topic: 'Grief', title: 'Hello', body: BODY })).toMatchObject({ ok: false, code: 'needs-plan' })
    api.demo.grantPlan('monthly')
    expect(api.forum.create({ topic: 'Grief', title: 'Hello', body: BODY }).ok).toBe(true)
  })
  it('refuses comments and support without a plan', () => {
    const post = getDb().posts.find((p) => !p.mine && p.status === 'published')!
    expect(api.forum.comment(post.id, 'Kind words')).toMatchObject({ ok: false, code: 'needs-plan' })
    const before = getDb().posts.find((p) => p.id === post.id)!.supports
    api.forum.toggleSupport(post.id)
    expect(getDb().posts.find((p) => p.id === post.id)!.supports).toBe(before)
  })
  it('refuses support spaces and group chats without a plan', () => {
    expect(api.spaces.join('grief')).toMatchObject({ ok: false, code: 'needs-plan' })
    const g = getDb().groupChats[0]
    expect(api.groups.register(g.id)).toMatchObject({ ok: false, code: 'needs-plan' })
  })
  it('refuses booking a therapist without a plan, but still lets a plan be bought', () => {
    const t = THERAPISTS[0]
    const slot = slotsFor(t, [], now()).find((s) => s.modes.includes('chat'))!
    expect(api.billing.createCheckout({ kind: 'session', therapistId: t.id, mode: 'chat', start: slot.start })).toMatchObject({ ok: false, code: 'needs-plan' })
    expect(api.billing.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true }).ok).toBe(true)
  })
  it('refuses peer matching without a plan, as before', () => {
    expect(api.match.start()).toMatchObject({ ok: false, code: 'needs-plan' })
  })
  it('allows everything while a cancelled plan is still paid for, and stops when it lapses', () => {
    api.demo.grantPlan('monthly')
    update((s) => (s.subscription ? { subscription: { ...s.subscription, cancelledAt: now(), autoRenew: false } } : {}))
    expect(api.spaces.join('grief').ok).toBe(true)
    advanceClock(31 * 24 * 60)
    expect(api.spaces.join('anxiety')).toMatchObject({ ok: false, code: 'needs-plan' })
    expect(api.forum.create({ topic: 'Grief', title: 'Hello', body: BODY })).toMatchObject({ ok: false, code: 'needs-plan' })
  })
})


describe('what My plan shows', () => {
  const DAY = 24 * 3600_000
  const sub = { startedAt: 0, endsAt: 30 * DAY }
  it('counts whole days left, and says so in words', () => {
    expect(daysLeft(sub, 0)).toBe(30)
    expect(daysLeft(sub, 29.5 * DAY)).toBe(1)
    expect(daysLeft(sub, 31 * DAY)).toBe(0)
    expect(daysLeftLabel(sub, 7 * DAY)).toBe('23 days left')
    expect(daysLeftLabel(sub, 29.2 * DAY)).toBe('Ends today')
    expect(daysLeftLabel({ endsAt: 1.5 * DAY }, 0)).toBe('2 days left')
    expect(daysLeftLabel(sub, 31 * DAY)).toBe('Ended')
  })
  it('measures how much of the period has passed, never outside 0 to 1', () => {
    expect(periodUsed(sub, 0)).toBe(0)
    expect(periodUsed(sub, 15 * DAY)).toBe(0.5)
    expect(periodUsed(sub, 99 * DAY)).toBe(1)
    expect(periodUsed(sub, -5 * DAY)).toBe(0)
    expect(periodUsed({ startedAt: 5, endsAt: 5 }, 9)).toBe(1)
  })
  it('lists what the plan gives from the plan’s own settings', () => {
    const plan = (e: PlanCfg['entitlements']) => ({ entitlements: e })
    const all = planIncludes(plan({ disappearing: true, therapistDiscountPct: 10 }))
    expect(all.some((l) => /5 chats at a time/.test(l))).toBe(true)
    expect(all.some((l) => /Community/.test(l))).toBe(true)
    expect(all).toContain('Therapist sessions at 10% off')
    expect(all).toContain('Disappearing messages')
    const lean = planIncludes(plan({ disappearing: false, therapistDiscountPct: 0 }))
    expect(lean).toContain('Book sessions with a verified therapist')
    expect(lean).not.toContain('Disappearing messages')
    expect(lean.some((l) => /% off/.test(l))).toBe(false)
  })
})

describe('what the plans picker shows', () => {
  const daily = { priceKes: 100, days: 1 }
  const monthly = { priceKes: 1500, days: 30 }
  const yearly = { priceKes: 12000, days: 365 }
  it('works out the price a day, and says nothing while a price is undecided', () => {
    expect(perDayKes(daily)).toBe(100)
    expect(perDayKes(monthly)).toBe(50)
    expect(perDayKes(yearly)).toBe(33)
    expect(perDayKes({ priceKes: null, days: 30 })).toBeNull()
  })
  it('shows how much cheaper a longer plan is than the daily one, and nothing when it is not', () => {
    expect(savingVsDaily(monthly, daily)).toBe(50)
    expect(savingVsDaily(yearly, daily)).toBe(67)
    expect(savingVsDaily(daily, daily)).toBeNull()
    expect(savingVsDaily({ priceKes: 5000, days: 30 }, daily)).toBeNull()
    expect(savingVsDaily(monthly, undefined)).toBeNull()
    expect(savingVsDaily({ priceKes: null, days: 30 }, daily)).toBeNull()
  })
  it('keeps the free list to what really is free, and says nothing about the Community', () => {
    expect(FREE_ITEMS.join(' ')).toMatch(/Urgent help/)
    expect(FREE_ITEMS.join(' ')).not.toMatch(/community/i)
  })
})
