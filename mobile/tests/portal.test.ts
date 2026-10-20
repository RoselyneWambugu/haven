import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../src/api'
import { THERAPISTS } from '../src/data/seed'
import { blocksToCells, cellKey, cellsToBlocks, detectSolicitation, isAvailable, licenceStatus, nextCell, split } from '../src/lib/portal'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { freshState, getDb, update } from '../src/store/db'

describe('availability grid', () => {
  it('turns blocks into cells and back without losing anything', () => {
    const blocks = [
      { dow: 1, start: '09:00', end: '12:00', modes: ['chat', 'voice', 'video'] as const },
      { dow: 5, start: '09:00', end: '12:00', modes: ['chat'] as const },
    ].map((b) => ({ ...b, modes: [...b.modes] }))
    const cells = blocksToCells(blocks)
    expect(cells[cellKey(1, 10)]).toBe('all')
    expect(cells[cellKey(5, 9)]).toBe('chat')
    expect(cellsToBlocks(cells)).toEqual(blocks)
  })
  it('splits a run when the modes change', () => {
    const cells = blocksToCells([{ dow: 2, start: '09:00', end: '11:00', modes: ['chat'] }])
    cells[cellKey(2, 10)] = 'all'
    expect(cellsToBlocks(cells).map((b) => [b.start, b.end])).toEqual([['09:00', '10:00'], ['10:00', '11:00']])
  })
  it('cycles a cell through its states', () => {
    expect(nextCell('off')).toBe('chat')
    expect(nextCell('all')).toBe('off')
  })
})

describe('licence reminders', () => {
  const day = 86_400_000
  it('warns 60 days ahead and flags expiry', () => {
    expect(licenceStatus(100 * day, 0).state).toBe('ok')
    expect(licenceStatus(45 * day, 0)).toEqual({ state: 'expiring', days: 45 })
    expect(licenceStatus(-1, 0).state).toBe('expired')
  })
})

describe('soliciting in forum replies', () => {
  it.each(['Book a session with me', 'DM me for more', 'I charge 1500 per hour', 'visit my clinic in Westlands', 'Contact me privately'])('flags %s', (t) => {
    expect(detectSolicitation(t)).toBe(true)
  })
  it.each(['Loneliness after a move is common. Small routines help.', 'A therapist can help with this.', 'Many people find slow breathing useful.'])('allows %s', (t) => {
    expect(detectSolicitation(t)).toBe(false)
  })
})

describe('earnings maths', () => {
  it('keeps blank amounts blank and splits placeholders', () => {
    expect(split(null)).toEqual({ gross: null, fee: null, net: null })
    expect(split(1000)).toEqual({ gross: 1000, fee: 150, net: 850 })
  })
  it('releases money after the 24 hour hold', () => {
    expect(isAvailable(0, 23 * 3_600_000)).toBe(false)
    expect(isAvailable(0, 24 * 3_600_000)).toBe(true)
  })
})

describe('portal api', () => {
  const original = JSON.parse(JSON.stringify(THERAPISTS[0]))
  beforeEach(() => {
    resetClock()
    update(freshState())
    Object.assign(THERAPISTS[0], JSON.parse(JSON.stringify(original)))
    api.portal.signIn()
  })
  const p = () => getDb().portal!

  it('signs in as the demo therapist with sessions today', () => {
    expect(p().signedIn).toBe(true)
    expect(p().sessions.filter((s) => s.status === 'booked').length).toBe(3)
  })

  it('stops contact details in inbox replies and keeps the thread unchanged', () => {
    const th = p().threads[0]
    const r = api.portal.send(th.id, 'Call me on 0712 345 678')
    expect(r.ok).toBe(false)
    expect(p().threads[0].messages.length).toBe(th.messages.length)
    expect(api.portal.send(th.id, 'See you Tuesday.').ok).toBe(true)
  })

  it('refuses to send into a closed thread', () => {
    const closed = p().threads.find((t) => t.closed)!
    expect(api.portal.send(closed.id, 'Hello again')).toMatchObject({ ok: false, code: 'closed' })
  })

  it('only opens a session from 10 minutes before the start', () => {
    const later = p().sessions.find((s) => s.status === 'booked' && s.start > now() + 60 * 60_000)!
    expect(api.portal.join(later.id)).toMatchObject({ ok: false, code: 'early' })
    const soon = p().sessions.find((s) => s.clientName === 'NightOwl22' && s.status === 'booked')!
    expect(api.portal.join(soon.id)).toMatchObject({ ok: false, code: 'early' })
    advanceClock(3)
    expect(api.portal.join(soon.id).ok).toBe(true)
  })

  it('pays for attended sessions and holds a no-show for the billing rule', () => {
    const [a, b] = p().sessions.filter((s) => s.status === 'booked')
    api.portal.wrapUp(a.id, { attendance: 'attended', note: 'ok', followUp: null })
    api.portal.wrapUp(b.id, { attendance: 'no-show', note: '', followUp: null })
    const s = getDb().portal!.sessions
    expect(s.find((x) => x.id === a.id)!.grossKes).toBe(1500)
    expect(s.find((x) => x.id === b.id)!.grossKes).toBeNull()
  })

  it('sorts earnings into pending and available by the hold period', () => {
    const e = api.portal.earnings()
    expect(e.available).toBeGreaterThan(0)
    expect(e.rows.some((r) => !r.available)).toBe(true)
    advanceClock(60 * 60)
    expect(api.portal.earnings().pending).toBe(0)
  })

  it('records a concern with whether anyone is in immediate danger', () => {
    const r = api.portal.raiseConcern({ sessionId: p().sessions[0].id, danger: true, type: 'self-harm', detail: 'Said they might not be safe tonight' })
    expect(r.ok).toBe(true)
    expect(p().concerns[0]).toMatchObject({ danger: true, type: 'self-harm' })
  })

  it('tells booked clients when time off overlaps their session', () => {
    const s = p().sessions.find((x) => x.status === 'booked')!
    const r = api.portal.addTimeOff(s.start - 60_000, s.end + 60_000)
    expect(r).toMatchObject({ ok: true, value: { notified: 1 } })
  })

  it('validates the public profile and shares changes with the directory', () => {
    const base = { ...p().profile }
    expect(api.portal.saveProfile({ ...base, bio: 'Short' })).toMatchObject({ ok: false, code: 'bio' })
    expect(api.portal.saveProfile({ ...base, bio: 'Reach me on https://example.com for a private session' })).toMatchObject({ ok: false })
    expect(api.portal.saveProfile({ ...base, bio: 'I help people feel heard and build calm routines for sleep.' }).ok).toBe(true)
    expect(THERAPISTS[0].bio).toContain('calm routines')
  })

  it('hides a paused therapist from new bookings', () => {
    api.portal.setPaused(true)
    expect(THERAPISTS[0].acceptingNew).toBe(false)
    api.portal.setPaused(false)
    expect(THERAPISTS[0].acceptingNew).toBe(true)
  })

  it('changes payout only after a fresh check, once', () => {
    expect(api.portal.changePayout('M-Pesa 0700 ••• 000', 'monthly')).toMatchObject({ ok: false, code: 'reauth' })
    expect(api.portal.reauth('000000').ok).toBe(false)
    expect(api.portal.reauth('246810').ok).toBe(true)
    expect(api.portal.changePayout('M-Pesa 0700 ••• 000', 'monthly').ok).toBe(true)
    expect(api.portal.changePayout('M-Pesa 0711 ••• 111', 'weekly')).toMatchObject({ ok: false, code: 'reauth' })
  })

  it('lets a therapist reply in the forum with general information only', () => {
    const post = getDb().posts[0]
    expect(api.portal.forumReply(post.id, 'Message me and I will see you privately')).toMatchObject({ ok: false, code: 'solicit' })
    const ok = api.portal.forumReply(post.id, 'Many people find a steady wind-down routine helps with sleep.')
    expect(ok.ok).toBe(true)
    expect(getDb().posts[0].comments.at(-1)?.therapistId).toBe('t-amina')
  })

  it('moves a fresh application through review to approval', () => {
    update(freshState())
    api.portal.submitApplication()
    expect(getDb().portal!.application).toBe('submitted')
    api.portal.advanceReview()
    expect(getDb().portal!.application).toBe('more-info')
    api.portal.resubmit()
    api.portal.advanceReview()
    api.portal.advanceReview()
    expect(getDb().portal!.application).toBe('approved')
  })
})
