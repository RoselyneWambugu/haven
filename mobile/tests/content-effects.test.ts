import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { THERAPISTS } from '../src/data/seed'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { slotsFor } from '../src/lib/directory'
import { applyLimits, freshState, getDb, update } from '../src/store/db'

function register(dob = '14/03/1998') {
  api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob, email: '' })
  api.auth.acceptConsents()
  const otp = api.auth.requestOtp('register')
  if (!otp.ok) throw new Error('otp')
  api.auth.verifyOtp(otp.value.demoCode)
  api.auth.saveProfileDraft({ penName: 'BrightFern', avatar: 'moon', languages: ['English'], topics: ['Grief'] })
  expect(api.auth.completeRegistration('web').ok).toBe(true)
}
const as = (name: string) => expect(api.admin.signIn(name, DEMO_MFA).ok).toBe(true)

beforeEach(() => {
  vi.useFakeTimers()
  resetClock()
  update(freshState())
  applyLimits()
  register()
  as('S. Kamau')
})
afterEach(() => vi.useRealTimers())

describe('what staff change shows up for members', () => {
  it('uses the configured price and refuses a plan that is switched off', () => {
    const plans = getDb().content.plans.map((p) => (p.id === 'daily' ? { ...p, enabled: false } : p.id === 'monthly' ? { ...p, priceKes: 1800 } : p))
    api.config.proposePlans(plans)
    as('R. Achieng')
    api.config.approvePlans()
    expect(api.billing.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true })).toMatchObject({ ok: true, value: { amountKes: 1800 } })
    expect(api.billing.createCheckout({ kind: 'plan', planId: 'daily', autoRenew: false })).toMatchObject({ ok: false })
  })

  it('stops posting and commenting while the forum is paused, but not reading', () => {
    const post = getDb().posts[0]
    api.demo.grantPlan('monthly')
    expect(api.forum.comment(post.id, 'Thank you for sharing this').ok).toBe(true)
    api.config.setFlag('forum', false)
    expect(api.forum.create({ topic: 'Grief', title: 'A new post', body: 'Something I want to share here.' })).toMatchObject({ ok: false, code: 'forum-off' })
    expect(api.forum.comment(post.id, 'Another kind comment').ok).toBe(false)
    expect(getDb().posts.length).toBeGreaterThan(0)
  })

  it('stops disappearing chats being proposed when the flag is off', () => {
    api.demo.grantPlan('monthly')
    api.match.start()
    vi.advanceTimersByTime(5000)
    const conv = getDb().conversations[0]
    api.config.setFlag('disappearing', false)
    api.chat.proposeDisappearing(conv.id)
    expect(getDb().conversations[0].disappearing).toBe('off')
    api.config.setFlag('disappearing', true)
    api.chat.proposeDisappearing(conv.id)
    expect(getDb().conversations[0].disappearing).toBe('proposed-by-me')
  })

  it('refuses a video booking when video is switched off', () => {
    const t = THERAPISTS.find((x) => x.modes.includes('video'))!
    const slot = slotsFor(t, [], now()).find((s) => s.modes.includes('video'))!
    expect(api.billing.createCheckout({ kind: 'session', therapistId: t.id, mode: 'video', start: slot.start }).ok).toBe(true)
    api.config.setFlag('therapistVideo', false)
    expect(api.billing.createCheckout({ kind: 'session', therapistId: t.id, mode: 'video', start: slot.start }).ok).toBe(false)
  })

  it('does not look in neighbouring age ranges once that is turned off', () => {
    // BrightFern is 25-34 and speaks English only. Close every exact match by blocking them.
    api.demo.grantPlan('monthly')
    const exact = ['p-silver', 'p-rainy', 'p-heron'].map((id) => ({ id, penName: id, avatar: 'moon' as const, languages: ['English'], ageBand: '25-34' as const }))
    update((s) => ({ account: { ...s.account!, blocked: exact } }))
    api.match.start()
    vi.advanceTimersByTime(5000)
    expect(getDb().match.state).toBe('found')
    api.match.acknowledgeFound()
    update({ conversations: [], match: { state: 'idle' } })
    api.config.setMatching({ neighbourFallback: false, softTopicWeight: 0, rematchCooldownDays: 30 })
    api.match.start()
    vi.advanceTimersByTime(5000)
    expect(getDb().match.state).toBe('searching')
  })

  it('does not pair people again until the wait after ending a match is over', () => {
    api.demo.grantPlan('monthly')
    api.config.setMatching({ neighbourFallback: false, softTopicWeight: 0, rematchCooldownDays: 30 })
    update((s) => ({ account: { ...s.account!, blocked: ['p-silver', 'p-heron'].map((id) => ({ id, penName: id, avatar: 'moon' as const, languages: ['English'], ageBand: '25-34' as const })) } }))
    api.match.start()
    vi.advanceTimersByTime(5000)
    const first = getDb().conversations[0]
    expect(first.peer!.id).toBe('p-rainy')
    api.chat.end(first.id)
    api.match.acknowledgeFound()
    api.match.start()
    vi.advanceTimersByTime(5000)
    expect(getDb().match.state).toBe('searching')
    advanceClock(31 * 24 * 60)
    vi.advanceTimersByTime(7000)
    expect(getDb().match.state).toBe('found')
  })

  it('prefers a shared topic only when the weight is above zero', () => {
    api.demo.grantPlan('monthly')
    update((s) => ({ account: { ...s.account!, blocked: ['p-rainy'].map((id) => ({ id, penName: id, avatar: 'moon' as const, languages: ['English'], ageBand: '25-34' as const })) } }))
    api.config.setMatching({ neighbourFallback: false, softTopicWeight: 0.5, rematchCooldownDays: 30 })
    for (let i = 0; i < 6; i++) {
      update({ conversations: [], match: { state: 'idle' } })
      api.match.start()
      vi.advanceTimersByTime(5000)
      expect(getDb().conversations[0].peer!.id).toBe('p-silver')
    }
  })

  it('applies a changed pen-name limit to members straight away', () => {
    api.config.setLimits({ graceDays: 7, penNameChangeDays: 5, deletionHoldDays: 14 })
    expect(api.auth.changePenName('CalmRiver').ok).toBe(true)
    advanceClock(6 * 24 * 60)
    expect(api.auth.changePenName('GentleOak').ok).toBe(true)
  })

  it('shows renamed topics on the member profile', () => {
    expect(getDb().account!.public.topics).toContain('Grief')
    api.config.renameTopic('Grief', 'Bereavement')
    expect(getDb().account!.public.topics).toContain('Bereavement')
    expect(getDb().account!.public.topics).not.toContain('Grief')
  })
})
