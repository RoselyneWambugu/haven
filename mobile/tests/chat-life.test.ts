import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { CHAT_LIFETIME_MS, expiresAt, isExpired, leftLabel, lifetimeLabel, sweep, timeLeft, warnBeforeMs } from '../src/lib/chatLife'
import { canBookTherapist, currentTherapist, MAX_PEER_CHATS, openPeerChats } from '../src/lib/limits'
import { freshState, getDb, update } from '../src/store/db'
import type { Conversation, Message } from '../src/api'

const H = 3600_000
const m = (i: number, from: Message['from'], text = 'hi'): Message => ({ id: `m${i}`, from, text, at: i })
const peer = (id: string, createdAt: number, over: Partial<Conversation> = {}): Conversation => ({
  id, kind: 'peer', peer: { id: `p-${id}`, penName: id, avatar: 'moon', ageBand: '25-34', languages: ['English'] } as never, therapistId: null,
  messages: [m(1, 'me'), m(2, 'them')], muted: false, archived: false, ended: false, disappearing: 'off', unread: 0, createdAt, lastAt: createdAt, ...over,
})
const th = (id: string, therapistId: string, createdAt: number, over: Partial<Conversation> = {}): Conversation => ({ ...peer(id, createdAt), kind: 'therapist', peer: null, therapistId, ...over })

describe('chat lifetime', () => {
  it('lasts 24 hours from the match', () => {
    const c = peer('a', 1000)
    expect(expiresAt(c)).toBe(1000 + CHAT_LIFETIME_MS)
    expect(isExpired(c, [], 1000 + 24 * H - 1)).toBe(false)
    expect(isExpired(c, [], 1000 + 24 * H)).toBe(true)
  })
  it('lasts a week for a therapist chat, and never ends before a booked or finished session plus 24 hours', () => {
    const c = th('t', 't-amina', 0)
    expect(expiresAt(c, [])).toBe(7 * 24 * H)
    expect(expiresAt(c, [{ therapistId: 't-amina', end: 5 * 24 * H, status: 'booked' }])).toBe(7 * 24 * H)
    expect(expiresAt(c, [{ therapistId: 't-amina', end: 100 * H, status: 'completed' }])).toBe(7 * 24 * H)
    expect(expiresAt(c, [{ therapistId: 't-amina', end: 10 * 24 * H, status: 'booked' }])).toBe(11 * 24 * H)
    expect(expiresAt(c, [{ therapistId: 't-amina', end: 10 * 24 * H, status: 'cancelled' }])).toBe(7 * 24 * H)
    expect(expiresAt(c, [{ therapistId: 't-james', end: 10 * 24 * H, status: 'booked' }])).toBe(7 * 24 * H)
  })
  it('keeps a peer chat to a day whatever sessions there are', () => {
    expect(expiresAt(peer('p', 0), [{ therapistId: 't-amina', end: 10 * 24 * H, status: 'booked' }])).toBe(24 * H)
  })
  it('warns an hour before a peer chat ends and a day before a therapist chat ends', () => {
    expect(warnBeforeMs({ kind: 'peer' })).toBe(H)
    expect(warnBeforeMs({ kind: 'therapist' })).toBe(24 * H)
    expect(lifetimeLabel({ kind: 'peer' })).toBe('24 hours')
    expect(lifetimeLabel({ kind: 'therapist' })).toBe('a week')
  })
  it('words the time left plainly', () => {
    expect(leftLabel(5 * H + 12 * 60_000)).toBe('5 h 12 min')
    expect(leftLabel(42 * 60_000)).toBe('42 min')
    expect(leftLabel(20_000)).toBe('under a minute')
    expect(leftLabel(0)).toBe('ending now')
  })
  it('splits expired chats into deleted and kept-for-review', () => {
    const t = 30 * H
    const r = sweep([peer('new', 20 * H), peer('old', 0), peer('reported', 0)], [], new Set(['reported']), t)
    expect(r.keep.map((c) => c.id)).toEqual(['new'])
    expect(r.drop.map((c) => c.id)).toEqual(['old'])
    expect(r.retain.map((c) => c.id)).toEqual(['reported'])
    expect(r.retain[0].ended).toBe(true)
  })
})

describe('chat limits', () => {
  it('counts only open peer chats, up to five', () => {
    const t = 5 * H
    const convs = [peer('1', 0), peer('2', 0), peer('3', 0), peer('4', 0, { ended: true }), th('x', 't-amina', 0), peer('5', -30 * H)]
    expect(openPeerChats(convs, [], t)).toBe(3)
    expect(MAX_PEER_CHATS).toBe(5)
  })
  it('allows one therapist at a time, by booked session or open chat', () => {
    const t = 5 * H
    expect(currentTherapist([], [], t)).toBeNull()
    const booked = [{ therapistId: 't-amina', start: 10 * H, end: 11 * H, status: 'booked' as const }]
    expect(currentTherapist([], booked, t)).toBe('t-amina')
    expect(canBookTherapist([], booked, 't-amina', t)).toBe(true)
    expect(canBookTherapist([], booked, 't-james', t)).toBe(false)
    expect(canBookTherapist([th('c', 't-amina', 0)], [], 't-james', t)).toBe(false)
    expect(canBookTherapist([th('c', 't-amina', 0, { ended: true })], [], 't-james', t)).toBe(true)
    expect(canBookTherapist([], [{ therapistId: 't-amina', start: 1, end: 2 * H, status: 'completed' as const }], 't-james', t)).toBe(true)
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
    api.demo.grantPlan('monthly')
  })

  it('deletes a chat after 24 hours, and warns an hour before', () => {
    update({ conversations: [peer('a', now())] })
    advanceClock(23 * 60 + 5)
    api.chat.sweep()
    expect(getDb().conversations[0].messages.at(-1)!.text).toContain('ends in about an hour')
    api.chat.sweep()
    expect(getDb().conversations[0].messages.filter((x) => x.text.includes('about an hour'))).toHaveLength(1)
    advanceClock(60)
    api.chat.sweep()
    expect(getDb().conversations).toHaveLength(0)
    expect(getDb().retained).toHaveLength(0)
  })
  it('keeps a reported chat out of the member’s view but retained for review', () => {
    update({ conversations: [peer('a', now())] })
    api.report.submit({ target: 'member', targetId: 'p-a', reason: 'harassment', note: '', conversationId: 'a' })
    advanceClock(25 * 60)
    api.chat.sweep()
    expect(getDb().conversations).toHaveLength(0)
    expect(getDb().retained.map((c) => c.id)).toEqual(['a'])
    api.chat.sweep()
    expect(getDb().retained).toHaveLength(1)
  })
  it('refuses a new match at five open chats, and allows one again when one ends', () => {
    update({ conversations: ['1', '2', '3', '4', '5'].map((i) => peer(i, now())) })
    expect(api.match.start()).toMatchObject({ ok: false, code: 'chat-limit' })
    api.chat.end('5')
    expect(api.match.start().ok).toBe(true)
  })
  it('refuses a second therapist while the first is in use', () => {
    update({ sessions: [{ id: 's1', therapistId: 't-amina', mode: 'chat', start: now() + 2 * H, end: now() + 3 * H, status: 'booked', priceKes: null, receiptNo: 'R', createdAt: 0, rating: null, followUpOffer: null, lateChargeApplied: false } as never] })
    const r = api.billing.createCheckout({ kind: 'session', therapistId: 't-james', mode: 'chat', start: now() + 5 * H })
    expect(r).toMatchObject({ ok: false, code: 'one-therapist' })
  })
  it('deletes a therapist chat after a week, with a day’s warning, and keeps a reported one for review', () => {
    update({ conversations: [th('t', 't-amina', now()), th('r', 't-james', now())] })
    api.report.submit({ target: 'member', targetId: 't-james', reason: 'other', note: '', conversationId: 'r' })
    advanceClock(6 * 24 * 60 + 60)
    api.chat.sweep()
    expect(getDb().conversations.find((c) => c.id === 't')!.messages.at(-1)!.text).toContain('ends in about a day')
    expect(getDb().conversations).toHaveLength(2)
    advanceClock(24 * 60)
    api.chat.sweep()
    expect(getDb().conversations).toHaveLength(0)
    expect(getDb().retained.map((c) => c.id)).toEqual(['r'])
  })
  it('says how long a chat has left', () => {
    const c = peer('a', now())
    expect(timeLeft(c, [], now())).toBe(24 * H)
  })
})
