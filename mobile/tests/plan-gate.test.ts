import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { THERAPISTS } from '../src/data/seed'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { slotsFor } from '../src/lib/directory'
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
