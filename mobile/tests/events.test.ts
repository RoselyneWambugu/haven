import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import type { NewEventInput } from '../src/lib/events'
import { upcomingEvents, validateNewEvent, validateProposal } from '../src/lib/events'
import { seedEvents } from '../src/data/events'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { alarmItems, dueAlarm, planAlarms } from '../src/lib/alarms'
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

describe('proposals from therapists', () => {
  const DAY = 24 * H
  const proposal = (over: Partial<Omit<NewEventInput, 'host'>> = {}) => {
    const { host: _h, ...rest } = good({ startsAt: now() + 6 * DAY })
    return { ...rest, ...over }
  }
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
  })

  it('need more notice than a staff event, and are run by the therapist', () => {
    const { host: _h, ...p } = good({ startsAt: 2 * DAY })
    expect(validateProposal(p, 'Dr. Amina Otieno', 0)).toMatch(/3 days ahead/)
    expect(validateProposal({ ...p, startsAt: 5 * DAY }, 'Dr. Amina Otieno', 0)).toBeNull()
  })

  it('wait for review, and members do not see them until they are approved', () => {
    expect(api.events.propose(proposal())).toMatchObject({ ok: false, code: 'not-therapist' })
    api.portal.signIn()
    const r = api.events.propose(proposal())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const e = getDb().events.find((x) => x.id === r.value.id)!
    expect(e).toMatchObject({ status: 'pending', host: 'Dr. Amina Otieno', proposedBy: 'Dr. Amina Otieno' })
    expect(upcomingEvents(getDb().events, now()).some((x) => x.id === e.id)).toBe(false)

    api.demo.grantPlan('monthly')
    expect(api.events.toggleInterest(e.id)).toMatchObject({ ok: false, code: 'gone' })

    expect(api.events.decide(e.id, true)).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.events.decide(e.id, true)).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    expect(api.events.decide(e.id, true).ok).toBe(true)
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Approved event proposal' })
    expect(upcomingEvents(getDb().events, now()).some((x) => x.id === e.id)).toBe(true)
    expect(api.events.toggleInterest(e.id).ok).toBe(true)
    expect(api.events.decide(e.id, true)).toMatchObject({ ok: false, code: 'gone' })
  })

  it('can be declined with a reason the therapist reads, and never shown to members', () => {
    api.portal.signIn()
    const r = api.events.propose(proposal())
    if (!r.ok) throw new Error('propose')
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    expect(api.events.decide(r.value.id, false, 'no')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.events.decide(r.value.id, false, 'We already have a walk that week').ok).toBe(true)
    const e = getDb().events.find((x) => x.id === r.value.id)!
    expect(e).toMatchObject({ status: 'declined', declineReason: 'We already have a walk that week' })
    expect(upcomingEvents(getDb().events, now()).some((x) => x.id === e.id)).toBe(false)
    expect(api.events.cancel(e.id, 'Cancelling a proposal')).toMatchObject({ ok: false, code: 'not-live' })
  })

  it('allow three waiting at once, and a therapist can withdraw one', () => {
    api.portal.signIn()
    const ids = [1, 2, 3].map((n) => {
      const r = api.events.propose(proposal({ title: `A proposal number ${n} here` }))
      if (!r.ok) throw new Error('propose')
      return r.value.id
    })
    expect(api.events.propose(proposal({ title: 'A fourth proposal here' }))).toMatchObject({ ok: false, code: 'too-many' })
    expect(api.events.withdraw(ids[0]).ok).toBe(true)
    expect(getDb().events.find((x) => x.id === ids[0])!.status).toBe('withdrawn')
    expect(api.events.withdraw(ids[0])).toMatchObject({ ok: false, code: 'gone' })
    expect(api.events.propose(proposal({ title: 'A fourth proposal here' })).ok).toBe(true)
  })
})

describe('reminders for events a member is interested in', () => {
  const MIN = 60_000
  const asMember = () => {
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
    api.auth.acceptConsents()
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
    api.auth.completeRegistration('web')
    api.demo.grantPlan('monthly')
  }
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    asMember()
  })
  const interested = () => {
    const e = getDb().events.find((x) => x.id === 'ev-sleep')!
    api.events.toggleInterest(e.id)
    return getDb().events.find((x) => x.id === 'ev-sleep')!
  }

  it('give the phone one alert, an hour before, and only for events the member marked', () => {
    const e = interested()
    const plan = planAlarms(alarmItems({ sessions: [], groupChats: [], events: getDb().events, therapistName: () => undefined }, now()), now(), { hideTextOnLockScreen: false })
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ id: `alarm:e:${e.id}:60`, at: e.startsAt - 60 * MIN, route: `/events/${e.id}` })
    expect(plan[0].body).toContain(e.title)
    const hidden = planAlarms(alarmItems({ sessions: [], groupChats: [], events: getDb().events, therapistName: () => undefined }, now()), now(), { hideTextOnLockScreen: true })
    expect(hidden[0].body).not.toContain(e.title)
    expect(planAlarms(alarmItems({ sessions: [], groupChats: [], events: seedEvents(now()), therapistName: () => undefined }, now()), now(), { hideTextOnLockScreen: false })).toEqual([])
  })

  it('never put the loud card across the screen, which is for sessions and group chats', () => {
    const e = interested()
    const items = alarmItems({ sessions: [], groupChats: [], events: getDb().events, therapistName: () => undefined }, e.startsAt - 2 * MIN)
    expect(items).toHaveLength(1)
    expect(dueAlarm(items, e.startsAt - 2 * MIN, new Set())).toBeNull()
  })

  it('stop when the member takes their interest back', () => {
    const e = interested()
    api.events.toggleInterest(e.id)
    expect(alarmItems({ sessions: [], groupChats: [], events: getDb().events, therapistName: () => undefined }, now())).toEqual([])
  })

  it('also appear in the notification list an hour before, once, if the setting is on', () => {
    const e = interested()
    api.notify.sync()
    expect(getDb().notifications.some((n) => n.category === 'event')).toBe(false)
    advanceClock((e.startsAt - 50 * MIN - now()) / MIN)
    api.notify.sync()
    api.notify.sync()
    const notes = getDb().notifications.filter((n) => n.category === 'event')
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ title: 'An event you’re interested in is coming up', href: `/events/${e.id}` })
  })

  it('stay quiet when Event reminders is switched off', () => {
    const e = interested()
    api.auth.setSettings({ notifyEvents: false })
    advanceClock((e.startsAt - 50 * MIN - now()) / MIN)
    api.notify.sync()
    expect(getDb().notifications.filter((n) => n.category === 'event')).toEqual([])
  })

  it('tell an interested member when the event is cancelled', () => {
    const e = interested()
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    expect(api.events.cancel(e.id, 'The speaker is unwell').ok).toBe(true)
    const note = getDb().notifications.find((n) => n.category === 'event')
    expect(note).toMatchObject({ title: 'An event you were interested in was cancelled', href: `/events/${e.id}` })
    expect(note!.body).toContain('The speaker is unwell')
  })
})

describe('editing a proposal and hearing about the decision', () => {
  const DAY = 24 * H
  const input = (over: Partial<Omit<NewEventInput, 'host'>> = {}) => {
    const { host: _h, ...rest } = good({ startsAt: now() + 6 * DAY })
    return { ...rest, ...over }
  }
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    api.portal.signIn()
  })
  const propose = () => {
    const r = api.events.propose(input())
    if (!r.ok) throw new Error('propose')
    return r.value.id
  }

  it('lets a therapist change a waiting proposal, with the same checks', () => {
    const id = propose()
    expect(api.events.edit(id, input({ title: 'short' }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.events.edit(id, input({ startsAt: now() + DAY }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.events.edit(id, input({ title: 'An evening talk, with a new title', durationMin: 90 })).ok).toBe(true)
    expect(getDb().events.find((e) => e.id === id)).toMatchObject({ title: 'An evening talk, with a new title', durationMin: 90, status: 'pending' })
  })

  it('sends a declined proposal back for review once it is edited, and clears the reason', () => {
    const id = propose()
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.events.decide(id, false, 'Please pick a weekday evening')
    expect(getDb().events.find((e) => e.id === id)).toMatchObject({ status: 'declined', declineReason: 'Please pick a weekday evening' })
    expect(api.events.edit(id, input({ title: 'A weekday evening talk, as asked' })).ok).toBe(true)
    const e = getDb().events.find((x) => x.id === id)!
    expect(e.status).toBe('pending')
    expect(e.declineReason).toBeUndefined()
  })

  it('cannot change a live, withdrawn or someone else’s proposal', () => {
    const id = propose()
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.events.decide(id, true)
    expect(api.events.edit(id, input())).toMatchObject({ ok: false, code: 'gone' })
    update({ portal: null })
    expect(api.events.edit(id, input())).toMatchObject({ ok: false, code: 'gone' })
  })

  it('leaves the therapist a note when a proposal is approved or declined, and they can mark them read', () => {
    const a = propose()
    const b = api.events.propose(input({ title: 'A second evening talk here' }))
    if (!b.ok) throw new Error('propose')
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.events.decide(a, true)
    api.events.decide(b.value.id, false, 'We already have a talk that week')
    const notes = getDb().portalNotes
    expect(notes.map((n) => n.title)).toEqual(['Your event proposal was declined', 'Your event was approved'])
    expect(notes[0].body).toContain('We already have a talk that week')
    expect(notes.every((n) => !n.read && n.href === '/portal/events')).toBe(true)
    api.events.markNotesRead()
    expect(getDb().portalNotes.every((n) => n.read)).toBe(true)
  })
})
