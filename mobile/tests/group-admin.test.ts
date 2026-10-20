import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { THERAPISTS } from '../src/data/seed'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { canAccess, canManageGroups } from '../src/lib/admin'
import { LIMITS, status, validateNewGroup, type NewGroupInput } from '../src/lib/groupChat'
import { freshState, getDb, update } from '../src/store/db'

const MIN = 60_000
const H = 3600_000
const good = (over: Partial<NewGroupInput> = {}): NewGroupInput => ({ topic: 'Coping with a new diagnosis', blurb: 'A gentle hour for people who have just had a diagnosis and want to talk.', facilitatorId: THERAPISTS[1].id, startsAt: 10 * H, durationMin: 60, capacity: 10, ...over })

describe('checking a new group chat', () => {
  const t = 0
  it('accepts a good one', () => {
    expect(validateNewGroup(good(), t, [], true)).toBeNull()
  })
  it('asks for a real topic and description', () => {
    expect(validateNewGroup(good({ topic: 'short' }), t, [], true)).toMatch(/topic/)
    expect(validateNewGroup(good({ blurb: 'too short' }), t, [], true)).toMatch(/description|about/)
    expect(validateNewGroup(good({ topic: 'x'.repeat(LIMITS.maxTopic + 1) }), t, [], true)).toMatch(/under/)
  })
  it('keeps length, places and lead time sensible', () => {
    expect(validateNewGroup(good({ durationMin: 10 }), t, [], true)).toMatch(/minutes/)
    expect(validateNewGroup(good({ capacity: 2 }), t, [], true)).toMatch(/places/)
    expect(validateNewGroup(good({ startsAt: 30 * MIN }), t, [], true)).toMatch(/hour ahead/)
  })
  it('needs a leader who is available, and not one already leading then', () => {
    expect(validateNewGroup(good(), t, [], false)).toMatch(/verified therapist/)
    const clash = [{ startsAt: 10 * H + 30 * MIN, durationMin: 60, facilitatorId: THERAPISTS[1].id }]
    expect(validateNewGroup(good(), t, clash, true)).toMatch(/already leading/)
    expect(validateNewGroup(good(), t, [{ ...clash[0], facilitatorId: THERAPISTS[2].id }], true)).toBeNull()
    expect(validateNewGroup(good(), t, [{ ...clash[0], cancelled: { reason: 'x', by: 'y', at: 0 } }], true)).toBeNull()
  })
})

describe('who manages group chats', () => {
  it('is clinical reviewers and Admins for scheduling and cancelling', () => {
    expect(canManageGroups('clinical')).toBe(true)
    expect(canManageGroups('admin')).toBe(true)
    expect(canManageGroups('moderator')).toBe(false)
    expect(canManageGroups('billing')).toBe(false)
    expect(canAccess('clinical', 'groups')).toBe(true)
    expect(canAccess('moderator', 'groups')).toBe(true)
    expect(canAccess('billing', 'groups')).toBe(false)
  })
})

describe('scheduling and cancelling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    for (const t of THERAPISTS) t.suspended = false
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
    api.auth.acceptConsents()
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
    api.auth.completeRegistration('web')
    api.demo.grantPlan('monthly')
    api.groups.ensure()
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
  })
  const input = (over: Partial<NewGroupInput> = {}) => good({ startsAt: now() + 3 * H, ...over })

  it('lets a clinical reviewer schedule one, logged, and members see it', () => {
    const r = api.groups.schedule(input())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const g = getDb().groupChats.find((x) => x.id === r.value.id)!
    expect(g).toMatchObject({ topic: 'Coping with a new diagnosis', createdBy: 'Dr. K. Mwende', registered: false })
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Scheduled group chat' })
    expect(api.groups.register(g.id).ok).toBe(true)
  })
  it('refuses moderators and billing staff, and a suspended therapist', () => {
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.groups.schedule(input())).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('J. Otieno', DEMO_MFA)
    expect(api.groups.schedule(input())).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.admin.suspendTherapist(THERAPISTS[1].id, 'Licence suspended by the regulator')
    expect(api.groups.schedule(input())).toMatchObject({ ok: false, code: 'invalid' })
  })
  it('runs a scheduled chat with a facilitator welcome and a closing note', () => {
    const r = api.groups.schedule(input())
    if (!r.ok) throw new Error('schedule')
    api.groups.register(r.value.id)
    advanceClock(3 * 60 + 2)
    api.groups.tick()
    const g = () => getDb().groupChats.find((x) => x.id === r.value.id)!
    expect(g().messages[0]).toMatchObject({ facilitator: true })
    expect(g().messages[0].text).toContain('Welcome, everyone')
    advanceClock(61)
    api.groups.tick()
    expect(g().messages.at(-1)).toMatchObject({ system: true })
  })
  it('cancels before it starts with a reason, and tells those signed up', () => {
    const r = api.groups.schedule(input())
    if (!r.ok) throw new Error('schedule')
    api.groups.register(r.value.id)
    expect(api.groups.cancel(r.value.id, 'no')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.groups.cancel(r.value.id, 'The facilitator is unwell').ok).toBe(true)
    const g = getDb().groupChats.find((x) => x.id === r.value.id)!
    expect(status(g, now())).toBe('cancelled')
    expect(getDb().notifications.some((n) => n.title === 'Your group chat was cancelled')).toBe(true)
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Cancelled group chat' })
    expect(api.groups.cancel(r.value.id, 'Again please')).toMatchObject({ ok: false })
    api.groups.unregister(r.value.id)
    expect(api.groups.register(r.value.id)).toMatchObject({ ok: false, code: 'cancelled' })
  })
  it('cannot cancel one that has started, and only the right roles cancel', () => {
    const r = api.groups.schedule(input())
    if (!r.ok) throw new Error('schedule')
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.groups.cancel(r.value.id, 'Not allowed here')).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    advanceClock(3 * 60 + 5)
    expect(api.groups.cancel(r.value.id, 'Too late now')).toMatchObject({ ok: false, code: 'started' })
  })
})

import { canModerateGroups } from '../src/lib/admin'
import { isRemoved, participants } from '../src/lib/groupChat'

describe('removing people from a group chat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    for (const t of THERAPISTS) t.suspended = false
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
    api.auth.acceptConsents()
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
    api.auth.completeRegistration('web')
    api.demo.grantPlan('monthly')
    api.groups.ensure()
    api.admin.signIn('T. Njeri', DEMO_MFA)
  })
  const grief = () => getDb().groupChats.find((x) => x.id.startsWith('gc-grief-'))!
  const open = () => {
    api.groups.register(grief().id)
    advanceClock((grief().startsAt - now()) / MIN + 3)
    api.groups.tick()
  }

  it('is for moderators, clinical reviewers and Admins, but not billing', () => {
    expect(canModerateGroups('moderator')).toBe(true)
    expect(canModerateGroups('clinical')).toBe(true)
    expect(canModerateGroups('admin')).toBe(true)
    expect(canModerateGroups('billing')).toBe(false)
    expect(canAccess('moderator', 'groups')).toBe(true)
    expect(canManageGroups('moderator')).toBe(false)
  })
  it('lists who has written, not the leader or Echo, plus the member who signed up', () => {
    open()
    const names = participants(grief(), 'QuietHeron').map((p) => p.name)
    expect(names).toContain('WarmLantern')
    expect(names).toContain('QuietHeron')
    expect(names.some((n) => n.startsWith('Dr.'))).toBe(false)
  })
  it('lets a moderator remove someone with a reason, logged, and hides their messages', () => {
    open()
    expect(api.groups.removeParticipant(grief().id, 'WarmLantern', 'no')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.groups.removeParticipant(grief().id, 'WarmLantern', 'Kept asking others for their numbers').ok).toBe(true)
    expect(isRemoved(grief(), 'WarmLantern')).toBe(true)
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Removed person from group chat' })
    expect(api.groups.removeParticipant(grief().id, 'WarmLantern', 'Already done twice')).toMatchObject({ ok: false })
    expect(api.groups.removeParticipant(grief().id, 'Nobody', 'Not even in the chat')).toMatchObject({ ok: false, code: 'not-in-chat' })
  })
  it('stops a removed person’s later scripted lines', () => {
    open()
    api.groups.removeParticipant(grief().id, 'SoftCurrent', 'Breaking the group rules')
    advanceClock(10)
    api.groups.tick()
    expect(grief().messages.filter((m) => m.name === 'SoftCurrent' && m.at > now() - 60_000).length).toBeLessThanOrEqual(1)
    const later = grief().messages.filter((m) => m.name === 'SoftCurrent')
    expect(later.length).toBeLessThanOrEqual(2)
  })
  it('locks out the member if they are removed, tells them, and keeps them from signing up again', () => {
    open()
    expect(api.groups.removeParticipant(grief().id, 'QuietHeron', 'Repeated unkind messages').ok).toBe(true)
    expect(api.groups.send(grief().id, 'Hello')).toMatchObject({ ok: false, code: 'removed' })
    expect(getDb().notifications.some((n) => n.title === 'You were removed from a group chat')).toBe(true)
    api.groups.unregister(grief().id)
    expect(api.groups.register(grief().id)).toMatchObject({ ok: false, code: 'removed' })
  })
  it('only works while the chat is open, and not for billing staff', () => {
    api.groups.register(grief().id)
    expect(api.groups.removeParticipant(grief().id, 'QuietHeron', 'Not started yet really')).toMatchObject({ ok: false, code: 'not-open' })
    open()
    api.admin.signIn('J. Otieno', DEMO_MFA)
    expect(api.groups.removeParticipant(grief().id, 'WarmLantern', 'Billing cannot do this')).toMatchObject({ ok: false, code: 'role' })
  })
  it('still does not let a moderator schedule or cancel', () => {
    expect(api.groups.schedule(good({ startsAt: now() + 3 * H }))).toMatchObject({ ok: false, code: 'role' })
    expect(api.groups.cancel(grief().id, 'Emergency cancel attempt')).toMatchObject({ ok: false, code: 'role' })
  })
})
