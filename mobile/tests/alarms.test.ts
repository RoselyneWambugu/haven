import { beforeEach, describe, expect, it } from 'vitest'
import { Platform } from 'react-native'
import { phone } from './stubs/expo-notifications'
import { ALARM_GRACE, alarmItems, dueAlarm, planAlarms, startsIn, type AlarmItem } from '../src/lib/alarms'
import { alarmAccess, askForAlarms, syncLocalAlarms } from '../src/lib/localAlarms'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import type { GroupChat, PortalSession, Session } from '../src/api/types'

const MIN = 60_000
const T = 1_800_000_000_000

const session = (id: string, startIn: number, over: Partial<Session> = {}): Session => ({ id, therapistId: 't-amina', mode: 'chat', start: T + startIn * MIN, end: T + (startIn + 45) * MIN, status: 'booked', priceKes: null, receiptNo: 'EC-1', createdAt: T, rating: null, followUpOffer: null, lateChargeApplied: false, ...over })
const names = (id: string) => (id === 't-amina' ? 'Dr. Amina Otieno' : undefined)
const items = (sessions: Session[], extra: { groupChats?: GroupChat[]; portalSessions?: PortalSession[] } = {}, t = T) => alarmItems({ sessions, groupChats: extra.groupChats ?? [], portalSessions: extra.portalSessions, therapistName: names }, t)

describe('what gets an alarm', () => {
  it('is a booked session that has not ended, soonest first, and nothing cancelled, finished or over', () => {
    const list = items([session('b', 120), session('a', 30), session('x', 30, { status: 'cancelled' }), session('done', -90, { end: T - 45 * MIN })])
    expect(list.map((i) => i.id)).toEqual(['s:a', 's:b'])
    expect(list[0]).toMatchObject({ kind: 'session', who: 'Dr. Amina Otieno', route: '/sessions/a' })
  })

  it('includes a group chat the member signed up for, and a therapist’s own client sessions', () => {
    const g = { id: 'g1', topic: 'Grief and loss', startsAt: T + 20 * MIN, durationMin: 60, registered: true } as GroupChat
    const notMine = { ...g, id: 'g2', registered: false } as GroupChat
    const p = { id: 'p1', clientName: 'NightOwl22', start: T + 15 * MIN, end: T + 60 * MIN, status: 'booked' } as PortalSession
    const list = items([], { groupChats: [g, notMine], portalSessions: [p] })
    expect(list.map((i) => [i.id, i.kind, i.route])).toEqual([['p:p1', 'client', '/portal/session/p1'], ['g:g1', 'group', '/group-chats/g1']])
  })
})

describe('the alarms handed to the phone', () => {
  it('are an hour before and ten minutes before, with the details unless the lock screen hides text', () => {
    const plan = planAlarms(items([session('a', 120)]), T, { hideTextOnLockScreen: false })
    expect(plan.map((a) => [a.id, a.at - T])).toEqual([['alarm:s:a:60', 60 * MIN], ['alarm:s:a:10', 110 * MIN]])
    expect(plan[1]).toMatchObject({ title: 'Time to get ready', body: 'Your session with Dr. Amina Otieno starts in 10 minutes.', route: '/sessions/a' })
    expect(plan[0].body).toBe('Your session with Dr. Amina Otieno starts in an hour.')
  })

  it('say only that something is starting when the lock screen hides text', () => {
    const plan = planAlarms(items([session('a', 120)]), T, { hideTextOnLockScreen: true })
    for (const a of plan) expect(a.body).not.toMatch(/Amina/)
    expect(plan[1].body).toBe('Something is starting in 10 minutes. Open Echo.')
  })

  it('skip a time that has already passed, so a session in 30 minutes gets only the ten-minute alarm', () => {
    const plan = planAlarms(items([session('a', 30)]), T, { hideTextOnLockScreen: false })
    expect(plan.map((a) => a.id)).toEqual(['alarm:s:a:10'])
    expect(planAlarms(items([session('soon', 5)]), T, { hideTextOnLockScreen: false })).toEqual([])
  })

  it('leave out anything more than two weeks away', () => {
    expect(planAlarms(items([session('far', 60 * 24 * 20)]), T, { hideTextOnLockScreen: false })).toEqual([])
  })
})

describe('the alarm card in the app', () => {
  const list = (): AlarmItem[] => items([session('a', 12), session('b', 90)])

  it('opens ten minutes before the start and not before', () => {
    expect(dueAlarm(list(), T, new Set())).toBeNull()
    expect(dueAlarm(list(), T + 2 * MIN, new Set())?.id).toBe('s:a')
    expect(dueAlarm(list(), T + 11 * MIN, new Set())?.id).toBe('s:a')
  })

  it('stays for ten minutes after the start, then goes', () => {
    expect(dueAlarm(list(), T + 12 * MIN + ALARM_GRACE, new Set())?.id).toBe('s:a')
    expect(dueAlarm(list(), T + 12 * MIN + ALARM_GRACE + 1, new Set())).toBeNull()
  })

  it('does not come back once dismissed, and moves on to the next session when its time comes', () => {
    const gone = new Set(['s:a'])
    expect(dueAlarm(list(), T + 5 * MIN, gone)).toBeNull()
    expect(dueAlarm(list(), T + 81 * MIN, gone)?.id).toBe('s:b')
  })

  it('says how long is left in plain words', () => {
    expect(startsIn(T + 8 * MIN, T)).toBe('starts in 8 minutes')
    expect(startsIn(T + 40_000, T)).toBe('starts in under a minute')
    expect(startsIn(T, T)).toBe('is starting now')
    expect(startsIn(T, T + 3 * MIN)).toBe('started 3 minutes ago')
  })
})

describe('on the phone', () => {
  beforeEach(() => {
    resetClock()
    ;(Platform as { OS: string }).OS = 'android'
    Object.assign(phone, { granted: true, canAskAgain: true, scheduled: [], asked: 0, channels: [] })
  })
  const plan = () => planAlarms(items([session('a', 7 * 24 * 60)], {}, now()).map((i) => ({ ...i, start: now() + 120 * MIN })), now(), { hideTextOnLockScreen: false })

  it('schedules each alarm on a loud channel and says it is on', async () => {
    expect(await syncLocalAlarms(plan())).toBe('on')
    expect(phone.channels).toEqual(['sessions'])
    expect(phone.scheduled.map((s) => s.identifier)).toEqual(['alarm:s:a:60', 'alarm:s:a:10'])
    expect(phone.scheduled[1].trigger).toMatchObject({ type: 'date', channelId: 'sessions' })
  })

  it('replaces what it scheduled before, and clears everything when there is nothing to alarm', async () => {
    phone.scheduled.push({ identifier: 'someone-elses', content: {}, trigger: { type: 'date', date: 1 } })
    await syncLocalAlarms(plan())
    await syncLocalAlarms(plan())
    expect(phone.scheduled.filter((s) => s.identifier.startsWith('alarm:'))).toHaveLength(2)
    await syncLocalAlarms([])
    expect(phone.scheduled.map((s) => s.identifier)).toEqual(['someone-elses'])
  })

  it('schedules nothing, and says why, when the phone has not allowed notifications', async () => {
    phone.granted = false
    expect(await syncLocalAlarms(plan())).toBe('off')
    phone.canAskAgain = false
    expect(await syncLocalAlarms(plan())).toBe('denied')
    expect(phone.scheduled).toEqual([])
    expect(await alarmAccess()).toBe('denied')
  })

  it('asks the phone for permission only when told to', async () => {
    phone.granted = false
    await syncLocalAlarms(plan())
    expect(phone.asked).toBe(0)
    await askForAlarms()
    expect(phone.asked).toBe(1)
  })

  it('does nothing in a browser, where a closed page cannot be alarmed', async () => {
    ;(Platform as { OS: string }).OS = 'web'
    expect(await syncLocalAlarms(plan())).toBe('unsupported')
    expect(await alarmAccess()).toBe('unsupported')
    expect(phone.scheduled).toEqual([])
  })

  it('follows the demo clock when it moves', () => {
    const before = now()
    advanceClock(30)
    expect(now() - before).toBe(30 * MIN)
  })
})

import { withoutMuted } from '../src/lib/alarms'
describe('a session whose bell is off', () => {
  it('is left out of the reminders, the others are kept', () => {
    const a = { id: 's:1', kind: 'session', start: 1, who: 'x', route: '/' } as AlarmItem
    const b = { ...a, id: 's:2' }
    expect(withoutMuted([a, b], ['s:1']).map((i) => i.id)).toEqual(['s:2'])
    expect(withoutMuted([a, b], [])).toHaveLength(2)
  })
})

import { fromEat } from '../src/lib/time'
describe('the notification settings on alarms', () => {
  it('neutral notifications hide the title and the text on the lock screen', () => {
    const plan = planAlarms(items([session('a', 120)]), T, { hideTextOnLockScreen: false, neutralNotifications: true })
    expect(plan.length).toBe(2)
    for (const a of plan) {
      expect(a.title).toBe('You have a new update')
      expect(a.body).toBe('Open the app to see it.')
    }
  })
  it('without neutral notifications the alarm says what it is', () => {
    const plan = planAlarms(items([session('a', 120)]), T, { hideTextOnLockScreen: false, neutralNotifications: false })
    expect(plan[0].title).toBe('Coming up in an hour')
  })
  describe('quiet hours', () => {
    // An event at 06:30 EAT: its hour-before heads-up would be at 05:30, in quiet hours.
    const start = fromEat(2026, 9, 21, 6, 30)
    const before = start - 3 * 3600_000
    const ev = (startAt: number): AlarmItem => ({ id: 'e:1', kind: 'event', start: startAt, who: 'Grief walk', route: '/events/1' })
    it('hold an event heads-up until 7am, or drop it when the event starts first', () => {
      expect(planAlarms([ev(start)], before, { hideTextOnLockScreen: false, quietHours: true })).toEqual([])
      const later = fromEat(2026, 9, 21, 9, 0)
      const held = planAlarms([ev(later)], before, { hideTextOnLockScreen: false, quietHours: true })
      expect(held).toHaveLength(1)
      expect(held[0].at).toBe(fromEat(2026, 9, 21, 8, 0)) // an hour before 9:00 is outside quiet hours, so it is left alone
      const tight = planAlarms([ev(fromEat(2026, 9, 21, 7, 30))], before, { hideTextOnLockScreen: false, quietHours: true })
      expect(tight[0].at).toBe(fromEat(2026, 9, 21, 7, 0)) // 6:30 is quiet, so it moves to 7:00
    })
    it('leave an event alone when quiet hours are off', () => {
      expect(planAlarms([ev(start)], before, { hideTextOnLockScreen: false, quietHours: false })[0].at).toBe(start - 3600_000)
    })
    it('never silence a booked session or group chat', () => {
      const s: AlarmItem = { id: 's:1', kind: 'session', start, who: 'Dr. Amina', route: '/sessions/1' }
      const plan = planAlarms([s], before, { hideTextOnLockScreen: false, quietHours: true })
      expect(plan.map((a) => a.at)).toEqual([start - 3600_000, start - 600_000])
    })
  })
})
