import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import type { NewEventInput } from '../src/lib/events'
import { upcomingEvents, validateNewEvent } from '../src/lib/events'
import { seedEvents } from '../src/data/events'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { freshState, getDb, update } from '../src/store/db'

const H = 3600_000
const good = (over: Partial<NewEventInput> = {}): NewEventInput => ({
  title: 'Sleeping better when your mind will not switch off', blurb: 'A relaxed talk on why nights get loud and a few small routines that help.', kind: 'webinar', mode: 'online',
  place: 'Online. The link is sent the day before.', startsAt: 10 * H, durationMin: 60, host: 'Echo', ...over,
})

describe('checking a new event', () => {
  it('accepts a good one', () => expect(validateNewEvent(good(), 0)).toBeNull())
  it('wants a title, a description, a place and a host', () => {
    expect(validateNewEvent(good({ title: 'short' }), 0)).toMatch(/title/)
    expect(validateNewEvent(good({ blurb: 'too short' }), 0)).toMatch(/about/)
    expect(validateNewEvent(good({ place: '' }), 0)).toMatch(/join/)
    expect(validateNewEvent(good({ mode: 'in-person', place: '' }), 0)).toMatch(/public place/)
    expect(validateNewEvent(good({ host: '' }), 0)).toMatch(/running/)
  })
  it('keeps length and lead time sensible', () => {
    expect(validateNewEvent(good({ durationMin: 10 }), 0)).toMatch(/minutes/)
    expect(validateNewEvent(good({ startsAt: 30 * 60_000 }), 0)).toMatch(/hour ahead/)
  })
})

describe('what members see', () => {
  it('lists events that are coming up, soonest first, and drops finished and cancelled ones', () => {
    const t = Date.now()
    const list = seedEvents(t)
    list.push({ ...list[0], id: 'old', startsAt: t - 5 * H })
    list.push({ ...list[0], id: 'gone', cancelled: { reason: 'Speaker unwell', at: t } })
    const shown = upcomingEvents(list, t)
    expect(shown.map((e) => e.id)).not.toContain('old')
    expect(shown.map((e) => e.id)).not.toContain('gone')
    expect(shown.map((e) => e.startsAt)).toEqual([...shown.map((e) => e.startsAt)].sort((a, b) => a - b))
  })
})

describe('events in the app', () => {
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
  })

  it('come with a few starter events', () => expect(getDb().events.length).toBeGreaterThanOrEqual(3))

  it('need a plan to say you are interested, and the count follows', () => {
    const id = getDb().events[0].id
    expect(api.events.toggleInterest(id)).toMatchObject({ ok: false, code: 'needs-plan' })
    api.demo.grantPlan('monthly')
    const before = getDb().events[0].interested
    expect(api.events.toggleInterest(id).ok).toBe(true)
    expect(getDb().events[0]).toMatchObject({ interestedByMe: true, interested: before + 1 })
    api.events.toggleInterest(id)
    expect(getDb().events[0]).toMatchObject({ interestedByMe: false, interested: before })
  })

  it('cannot be marked once they have finished', () => {
    api.demo.grantPlan('monthly')
    const e = getDb().events[0]
    advanceClock(8 * 24 * 60)
    expect(api.events.toggleInterest(e.id)).toMatchObject({ ok: false, code: 'gone' })
  })

  it('are scheduled only by clinical reviewers and Admins, logged, and can be cancelled with a reason', () => {
    const input = good({ startsAt: now() + 3 * H })
    expect(api.events.schedule(input)).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.events.schedule(input)).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    const r = api.events.schedule(input)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const e = getDb().events.find((x) => x.id === r.value.id)!
    expect(e).toMatchObject({ title: input.title, createdBy: 'Dr. K. Mwende', interested: 0 })
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Scheduled event' })
    expect(api.events.cancel(e.id, 'no')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.events.cancel(e.id, 'The speaker is unwell').ok).toBe(true)
    expect(getDb().events.find((x) => x.id === e.id)!.cancelled?.reason).toBe('The speaker is unwell')
    expect(api.events.cancel(e.id, 'Again')).toMatchObject({ ok: false })
  })
})
