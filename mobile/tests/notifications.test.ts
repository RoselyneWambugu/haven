import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { deliverAt, due, HOURLY_CAP, inQuietHours, isEnabled, isNudge, lockScreen, overCap, quietEnds, unreadCount } from '../src/lib/notifications'
import { eat, fromEat } from '../src/lib/time'
import { freshState, getDb, update } from '../src/store/db'

const settings = { notifyMessages: true, notifySessions: true, notifyForum: true, notifyPlan: true, quietHours: true, hideTextOnLockScreen: true, neutralNotifications: false }

describe('quiet hours', () => {
  const at = (h: number, m = 0) => fromEat(2026, 9, 19, h, m)
  it('covers 10pm to 7am East Africa Time', () => {
    expect(inQuietHours(at(22))).toBe(true)
    expect(inQuietHours(at(3))).toBe(true)
    expect(inQuietHours(at(7))).toBe(false)
    expect(inQuietHours(at(21, 59))).toBe(false)
  })
  it('holds a note until 7am, the next morning after 10pm', () => {
    expect(quietEnds(at(23))).toBe(fromEat(2026, 9, 20, 7))
    expect(quietEnds(at(3))).toBe(at(7))
    expect(deliverAt('message', at(23), settings)).toBe(fromEat(2026, 9, 20, 7))
  })
  it('never holds back safety and account notices, or anything when quiet hours are off', () => {
    expect(deliverAt('safety', at(23), settings)).toBe(at(23))
    expect(deliverAt('account', at(2), settings)).toBe(at(2))
    expect(deliverAt('message', at(23), { quietHours: false })).toBe(at(23))
  })
})

describe('categories, cap, privacy and wording', () => {
  it('lets members switch off message, session, forum and plan notes, but not safety or account', () => {
    const off = { notifyMessages: false, notifySessions: false, notifyForum: false, notifyPlan: false }
    expect(isEnabled('message', off)).toBe(false)
    expect(isEnabled('plan', off)).toBe(false)
    expect(isEnabled('safety', off)).toBe(true)
    expect(isEnabled('account', off)).toBe(true)
  })
  it('caps non-safety notes per hour', () => {
    const existing = Array.from({ length: HOURLY_CAP }, (_, i) => ({ category: 'message' as const, at: 1000 + i }))
    expect(overCap(existing, 'message', 2000)).toBe(true)
    expect(overCap(existing, 'safety', 2000)).toBe(false)
    expect(overCap(existing, 'message', 1000 + 3600_000 + HOURLY_CAP)).toBe(false)
  })
  it('hides message text, or everything, on the lock screen as chosen', () => {
    const n = { category: 'message' as const, title: 'New message from A', body: 'secret words' }
    expect(lockScreen(n, { hideTextOnLockScreen: true, neutralNotifications: false }).body).not.toContain('secret')
    expect(lockScreen(n, { hideTextOnLockScreen: false, neutralNotifications: false }).body).toBe('secret words')
    const neutral = lockScreen(n, { hideTextOnLockScreen: false, neutralNotifications: true })
    expect(neutral.title).toBe('You have a new update')
    expect(JSON.stringify(neutral)).not.toMatch(/echo|secret/i)
  })
  it('flags pressure wording', () => {
    for (const bad of ['Someone is waiting for you!', 'We miss you', 'Come back and chat', 'Don’t miss out']) expect(isNudge(bad)).toBe(true)
    expect(isNudge('Your session is in an hour')).toBe(false)
  })
  it('lists due notes only, newest first', () => {
    const a = { deliverAt: 5, at: 1 }, b = { deliverAt: 9, at: 2 }, c = { deliverAt: 99, at: 3 }
    expect(due([a, b, c], 10)).toEqual([b, a])
    expect(unreadCount([{ deliverAt: 5, read: false, silent: false }, { deliverAt: 5, read: true, silent: false }, { deliverAt: 5, read: false, silent: true }, { deliverAt: 99, read: false, silent: false }], 10)).toBe(1)
  })
})

describe('notification api', () => {
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
    // Midday, so quiet hours do not apply.
    const t = eat(now())
    advanceClock(((12 - t.hour + 24) % 24) * 60)
  })

  it('adds a note once however often it is pushed, and respects the category switch', () => {
    api.notify.push('forum', 'k1', 'Hello', 'Body', '/home')
    api.notify.push('forum', 'k1', 'Hello', 'Body', '/home')
    expect(getDb().notifications).toHaveLength(1)
    api.auth.setSettings({ notifyForum: false })
    api.notify.push('forum', 'k2', 'Hello', 'Body', '/home')
    expect(getDb().notifications).toHaveLength(1)
    api.notify.push('safety', 'k3', 'Report received', 'Body', '/home')
    expect(getDb().notifications).toHaveLength(2)
  })
  it('marks silent past the cap and counts only the rest as new', () => {
    for (let i = 0; i < HOURLY_CAP + 2; i++) api.notify.push('message', `m${i}`, 'New message', 'x', '/home')
    const notes = getDb().notifications
    expect(notes.filter((n) => n.silent)).toHaveLength(2)
    expect(unreadCount(notes, now())).toBe(HOURLY_CAP)
  })
  it('holds a note made at night until the morning', () => {
    const t = eat(now())
    advanceClock(((23 - t.hour + 24) % 24) * 60)
    api.notify.push('message', 'night', 'New message', 'x', '/home')
    const n = getDb().notifications[0]
    expect(n.deliverAt).toBeGreaterThan(n.at)
    expect(due(getDb().notifications, now())).toHaveLength(0)
    advanceClock(9 * 60)
    expect(due(getDb().notifications, now())).toHaveLength(1)
  })
  it('creates a safety note when a report is sent', () => {
    api.report.submit({ target: 'member', targetId: 'p-x', reason: 'threats', note: '' })
    expect(getDb().notifications[0]).toMatchObject({ category: 'safety' })
  })
  it('derives account notices once', () => {
    api.demo.addNotice()
    api.notify.sync()
    api.notify.sync()
    expect(getDb().notifications.filter((n) => n.category === 'account')).toHaveLength(1)
  })
  it('writes no pressure wording', () => {
    api.demo.addNotice()
    api.report.submit({ target: 'member', targetId: 'p-x', reason: 'threats', note: '' })
    api.notify.sync()
    for (const n of getDb().notifications) expect(isNudge(`${n.title} ${n.body}`)).toBe(false)
  })
})

describe('time-based reminders', () => {
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
    advanceClock(((12 - eat(now()).hour + 24) % 24) * 60)
  })
  const session = (id: string, start: number) => ({ id, therapistId: 't-amina', mode: 'chat', start, end: start + 3000_000, status: 'booked', priceKes: null, receiptNo: 'R', createdAt: 0, rating: null, followUpOffer: null, lateChargeApplied: false }) as never

  it('reminds an hour before and ten minutes before, once each', () => {
    update({ sessions: [session('s1', now() + 3 * 3600_000)] })
    api.notify.sync()
    expect(getDb().notifications).toHaveLength(0)
    advanceClock(125)
    api.notify.sync()
    api.notify.sync()
    expect(getDb().notifications.map((n) => n.key)).toEqual(['s:s1:1h'])
    advanceClock(52)
    api.notify.sync()
    expect(getDb().notifications.map((n) => n.key).sort()).toEqual(['s:s1:10m', 's:s1:1h'])
  })
  it('says when a plan is about to end', () => {
    update({ subscription: { planId: 'monthly', startedAt: now() - 27 * 86400_000, endsAt: now() + 2 * 86400_000, autoRenew: false, cancelledAt: null, method: 'mpesa', receiptNo: 'R' } })
    api.notify.sync()
    expect(getDb().notifications[0]).toMatchObject({ category: 'plan', title: 'Your plan ends soon' })
  })
})
