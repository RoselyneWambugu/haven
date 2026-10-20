import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { CLOSING, GROUP_TEMPLATES, SCRIPTS } from '../src/data/groupChats'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { canRegister, deletesAt, endsAt, linesDue, LOBBY_MINUTES, seatsLeft, SCRIPT_SPACING_MS, status, whenLabel } from '../src/lib/groupChat'
import { groupSnapshot } from '../src/lib/snapshot'
import { detectBlockedContent } from '../src/lib/safety'
import { detectSolicitation } from '../src/lib/portal'
import { eat, fromEat } from '../src/lib/time'
import { freshState, getDb, update } from '../src/store/db'
import type { GroupChat } from '../src/api'

const MIN = 60_000
const H = 3600_000
const g = (over: Partial<GroupChat> = {}): GroupChat => ({ id: 'gc-grief-x', topic: 'T', blurb: 'B', facilitatorId: 't-amina', startsAt: 1000 * MIN, durationMin: 60, capacity: 12, takenOthers: 7, registered: false, messages: [], posted: 0, ...over })

describe('group chat status', () => {
  it('moves from upcoming to lobby, open and ended', () => {
    const x = g()
    expect(status(x, x.startsAt - 30 * MIN)).toBe('upcoming')
    expect(status(x, x.startsAt - LOBBY_MINUTES * MIN)).toBe('lobby')
    expect(status(x, x.startsAt)).toBe('open')
    expect(status(x, endsAt(x) - 1)).toBe('open')
    expect(status(x, endsAt(x))).toBe('ended')
  })
  it('is deleted 24 hours after it ends', () => {
    expect(deletesAt(g())).toBe(endsAt(g()) + 24 * H)
  })
  it('counts places and only lets you sign up before it starts', () => {
    const x = g()
    expect(seatsLeft(x)).toBe(5)
    expect(seatsLeft({ ...x, registered: true })).toBe(4)
    expect(canRegister(x, x.startsAt - H)).toBe(true)
    expect(canRegister(x, x.startsAt + MIN)).toBe(false)
    expect(canRegister({ ...x, takenOthers: 12 }, x.startsAt - H)).toBe(false)
    expect(canRegister({ ...x, registered: true }, x.startsAt - H)).toBe(false)
  })
  it('labels the time in East Africa Time', () => {
    const now0 = fromEat(2026, 9, 19, 10, 0)
    expect(whenLabel(fromEat(2026, 9, 20, 14, 0), now0)).toBe('Tomorrow, 14:00 EAT')
    expect(whenLabel(fromEat(2026, 9, 19, 19, 0), now0)).toBe('Today, 19:00 EAT')
  })
  it('posts scripted lines on a steady pace, each once', () => {
    const x = g()
    const script = SCRIPTS.grief
    expect(linesDue(script, 0, x, x.startsAt - 1)).toEqual([])
    expect(linesDue(script, 0, x, x.startsAt)).toHaveLength(1)
    expect(linesDue(script, 0, x, x.startsAt + 3 * SCRIPT_SPACING_MS)).toHaveLength(4)
    expect(linesDue(script, 4, x, x.startsAt + 3 * SCRIPT_SPACING_MS)).toHaveLength(0)
    expect(linesDue(script, 0, x, endsAt(x) + 99 * H)).toHaveLength(script.length)
  })
})

describe('the schedule and scripts', () => {
  it('includes grief tomorrow at 14:00 EAT, and each topic has a script that follows the rules', () => {
    expect(GROUP_TEMPLATES.find((t) => t.key === 'grief')).toMatchObject({ dayOffset: 1, hour: 14 })
    for (const tpl of GROUP_TEMPLATES) {
      const script = SCRIPTS[tpl.key]
      expect(script[0].facilitator).toBe(true)
      expect(CLOSING[tpl.key]).toContain('24 hours')
      for (const l of script) {
        expect(detectBlockedContent(l.text).blocked).toBe(false)
        expect(detectSolicitation(l.text)).toBe(false)
      }
    }
  })
})

describe('in the app', () => {
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
    api.groups.ensure()
  })
  const grief = () => getDb().groupChats.find((x) => x.id.startsWith('gc-grief-'))!

  it('schedules each topic once, with the grief chat at 14:00 tomorrow', () => {
    expect(getDb().groupChats).toHaveLength(GROUP_TEMPLATES.length)
    api.groups.ensure()
    expect(getDb().groupChats).toHaveLength(GROUP_TEMPLATES.length)
    expect(eat(grief().startsAt).hour).toBe(14)
    expect(grief().startsAt).toBeGreaterThan(now())
  })
  it('lets a member sign up and give up a place, and warns when it is full', () => {
    expect(api.groups.register(grief().id).ok).toBe(true)
    expect(grief().registered).toBe(true)
    api.groups.unregister(grief().id)
    expect(grief().registered).toBe(false)
    update((s) => ({ groupChats: s.groupChats.map((x) => ({ ...x, takenOthers: x.capacity })) }))
    expect(api.groups.register(grief().id)).toMatchObject({ ok: false, code: 'closed' })
  })
  it('opens at the start time: nobody can write before, and the room posts its own lines', () => {
    api.groups.register(grief().id)
    expect(api.groups.send(grief().id, 'Hello')).toMatchObject({ ok: false, code: 'not-open' })
    advanceClock((grief().startsAt - now()) / MIN + 1)
    api.groups.tick()
    expect(grief().messages[0].facilitator).toBe(true)
    expect(api.groups.send(grief().id, 'Hello everyone, I am here.').ok).toBe(true)
    expect(grief().messages.some((x) => x.mine)).toBe(true)
  })
  it('applies the same content rules as every chat, and needs a sign-up', () => {
    advanceClock((grief().startsAt - now()) / MIN + 1)
    expect(api.groups.send(grief().id, 'Hello')).toMatchObject({ ok: false, code: 'not-registered' })
    getDb().groupChats.forEach(() => undefined)
    update((s) => ({ groupChats: s.groupChats.map((x) => (x.id === grief().id ? { ...x, registered: true } : x)) }))
    expect(api.groups.send(grief().id, 'Call me on 0712 345 678')).toMatchObject({ ok: false, code: 'blocked' })
    expect(api.groups.send(grief().id, '   ')).toMatchObject({ ok: false, code: 'empty' })
  })
  it('ends with a closing note and is deleted 24 hours later', () => {
    const id = grief().id
    api.groups.register(id)
    advanceClock((grief().startsAt - now()) / MIN + 61)
    api.groups.tick()
    expect(grief().closed).toBe(true)
    expect(grief().messages.at(-1)).toMatchObject({ system: true })
    expect(api.groups.send(id, 'Too late')).toMatchObject({ ok: false, code: 'not-open' })
    advanceClock(24 * 60)
    api.groups.tick()
    expect(getDb().groupChats.some((x) => x.id === id)).toBe(false)
    expect(getDb().retainedGroups).toHaveLength(0)
  })
  it('keeps a reported group chat for review after it is deleted', () => {
    const id = grief().id
    api.groups.register(id)
    advanceClock((grief().startsAt - now()) / MIN + 2)
    api.groups.tick()
    const target = grief().messages.find((x) => !x.facilitator && !x.mine)
    expect(target).toBeTruthy()
    api.groups.report(id, target!.id, 'harassment')
    expect(getDb().reports[0]).toMatchObject({ groupChatId: id, target: 'message' })
    expect(getDb().reports[0].snapshot?.some((l) => l.reported)).toBe(true)
    advanceClock(26 * 60)
    api.groups.tick()
    expect(getDb().groupChats.some((x) => x.id === id)).toBe(false)
    expect(getDb().retainedGroups.map((x) => x.id)).toEqual([id])
  })
  it('reminds a signed-up member an hour and ten minutes before', () => {
    api.groups.register(grief().id)
    advanceClock((grief().startsAt - now()) / MIN - 55)
    api.notify.sync()
    expect(getDb().notifications.some((n) => n.key === `g:${grief().id}:1h`)).toBe(true)
    advanceClock(47)
    api.notify.sync()
    expect(getDb().notifications.some((n) => n.key === `g:${grief().id}:10m`)).toBe(true)
  })
  it('cannot report your own message or the closing note', () => {
    api.groups.register(grief().id)
    update((s) => ({ groupChats: s.groupChats.map((x) => (x.id === grief().id ? { ...x, messages: [{ id: 'mine', name: 'QuietHeron', avatar: 'moon' as const, text: 'hi', at: 1, mine: true }, { id: 'sys', name: 'Echo', avatar: 'leaf' as const, text: 'end', at: 2, system: true }] } : x)) }))
    api.groups.report(grief().id, 'mine', 'other')
    api.groups.report(grief().id, 'sys', 'other')
    expect(getDb().reports).toHaveLength(0)
  })
})

describe('group snapshot', () => {
  it('keeps the messages around the reported one, with the author’s pen name', () => {
    const msgs = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, name: i % 2 ? 'Other' : 'Me', text: `line ${i}`, mine: i % 2 === 0 }))
    const snap = groupSnapshot(msgs, 'm9')
    expect(snap.find((l) => l.reported)!.text).toBe('Other: line 9')
    expect(snap.length).toBeLessThanOrEqual(12)
    expect(snap.at(-1)!.text).toContain('line 11')
  })
})
