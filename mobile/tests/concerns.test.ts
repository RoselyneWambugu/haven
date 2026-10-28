import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { canSeeCase, visibleCases } from '../src/lib/admin'
import { sessionSnapshot } from '../src/lib/snapshot'
import { resetClock } from '../src/lib/clock'
import { freshState, getDb, update } from '../src/store/db'
import type { Conversation, Message } from '../src/api'

const m = (i: number, from: Message['from'], text: string): Message => ({ id: `m${i}`, from, text, at: i })

describe('session snapshot', () => {
  it('keeps the member’s words, the session details and the chat with that therapist', () => {
    const snap = sessionSnapshot({ therapist: 'Dr. Amina Otieno', mode: 'video', when: 'Mon 19 Oct, 10:00' }, '  They asked about my home address  ', [m(1, 'me', 'Hello'), m(2, 'them', 'Where do you live?')])
    expect(snap[0].text).toContain('Calls are not recorded')
    expect(snap[1].text).toBe('They asked about my home address')
    expect(snap.slice(2).map((l) => l.text)).toEqual(['Hello', 'Where do you live?'])
    expect(snap.at(-1)).toMatchObject({ who: 'reported', reported: true })
    expect(new Set(snap.map((l) => l.id)).size).toBe(snap.length)
  })
  it('leaves out an empty note', () => {
    expect(sessionSnapshot({ therapist: 'X', mode: 'chat', when: 'now' }, '   ')).toHaveLength(1)
  })
})

describe('who can see a therapist concern', () => {
  it('is for clinical reviewers and admins only', () => {
    const c = { queue: 'clinical' as const }
    expect(canSeeCase('clinical', c)).toBe(true)
    expect(canSeeCase('admin', c)).toBe(true)
    expect(canSeeCase('moderator', c)).toBe(false)
    expect(canSeeCase('billing', c)).toBe(false)
    expect(canSeeCase('moderator', {})).toBe(true)
    expect(visibleCases([{ queue: 'clinical' as const }, {}], 'moderator')).toHaveLength(1)
  })
})

describe('from report to case', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    const conv: Conversation = { id: 'c9', kind: 'therapist', peer: null, therapistId: 't-amina', messages: [m(1, 'me', 'Hello'), m(2, 'them', 'Where do you live?')], muted: false, archived: false, ended: false, disappearing: 'off', unread: 0, createdAt: 0, lastAt: 0 }
    update({
      conversations: [conv],
      sessions: [{ id: 's9', therapistId: 't-amina', mode: 'video', start: 1000, end: 4000, status: 'completed', priceKes: null, receiptNo: 'R', createdAt: 0, rating: null, followUpOffer: null, lateChargeApplied: false } as never],
    })
    api.report.submit({ target: 'session', targetId: 's9', reason: 'therapist-boundaries', note: 'They asked where I live', sessionId: 's9' })
  })

  it('becomes a severity-1 case in the clinical queue naming the therapist', () => {
    expect(api.admin.signIn('Dr. K. Mwende', DEMO_MFA).ok).toBe(true)
    api.admin.syncReports()
    const c = getDb().admin!.cases.find((x) => x.id.startsWith('C-r'))!
    expect(c).toMatchObject({ queue: 'clinical', severity: 'S1', type: 'Therapist boundaries', reported: 'Dr. Amina Otieno' })
    expect(c.evidence.some((e) => e.text === 'They asked where I live')).toBe(true)
  })
  it('is hidden from moderators, who cannot take, read or decide it', () => {
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.admin.syncReports()
    const id = getDb().admin!.cases.find((x) => x.id.startsWith('C-r'))!.id
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.admin.claim(id).ok).toBe(false)
    expect(api.admin.reveal(id, 'h1').ok).toBe(false)
    expect(api.admin.decide(id, 'dismiss', 'Not for me to decide').ok).toBe(false)
    expect(getDb().admin!.audit.some((e) => e.action === 'Revealed message' && e.target.startsWith(id))).toBe(false)
  })
  it('lets a clinical reviewer take, read and decide it', () => {
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.admin.syncReports()
    const id = getDb().admin!.cases.find((x) => x.id.startsWith('C-r'))!.id
    expect(api.admin.claim(id).ok).toBe(true)
    expect(api.admin.reveal(id, 'h1').ok).toBe(true)
    expect(api.admin.decide(id, 'escalate', 'Needs the clinical lead').ok).toBe(true)
  })
})

describe('what a clinical decision does', () => {
  let id = ''
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
    api.portal.signIn()
    const th = getDb().portal!.therapistId
    update({ sessions: [{ id: 's9', therapistId: th, mode: 'video', start: 1000, end: 4000, status: 'completed', priceKes: null, receiptNo: 'R', createdAt: 0, rating: null, followUpOffer: null, lateChargeApplied: false } as never] })
    api.report.submit({ target: 'session', targetId: 's9', reason: 'therapist-conduct', note: 'They were rude to me', sessionId: 's9' })
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    api.admin.syncReports()
    id = getDb().admin!.cases.find((x) => x.id.startsWith('C-r') && x.queue === 'clinical')!.id
  })
  const updates = () => getDb().notifications.filter((n) => n.title === 'An update on your concern')

  it('warning: tells the therapist it is not a suspension, and the member that action was taken', () => {
    expect(api.admin.decide(id, 'warn-therapist', 'Tone fell short of standards').ok).toBe(true)
    const p = getDb().portal!
    expect(p.review).toMatchObject({ kind: 'warning' })
    expect(p.paused).toBe(false)
    expect(updates()).toHaveLength(1)
    expect(updates()[0].body).toContain('took action')
    expect(JSON.stringify(p.review)).not.toMatch(/QuietHeron/)
  })
  it('pause: stops new clients, and only a clinical reviewer can lift it', () => {
    expect(api.admin.decide(id, 'pause-therapist', 'Pending a closer review').ok).toBe(true)
    expect(getDb().portal!.paused).toBe(true)
    expect(api.portal.setPaused(false)).toMatchObject({ ok: false, code: 'review' })
    expect(getDb().portal!.paused).toBe(true)
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.admin.liftTherapistPause('Moderators should not').ok).toBe(false)
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
    expect(api.admin.liftTherapistPause('no').ok).toBe(false)
    expect(api.admin.liftTherapistPause('Review complete, no further action').ok).toBe(true)
    expect(getDb().portal).toMatchObject({ paused: false, review: null })
    expect(getDb().admin!.audit[0].action).toBe('Lifted therapist pause')
  })
  it('no action: leaves the therapist alone and tells the member generically', () => {
    api.admin.decide(id, 'dismiss', 'No breach found on review')
    expect(getDb().portal!.review ?? null).toBeNull()
    expect(updates()[0].body).toContain('did not find a breach')
  })
  it('escalating tells nobody yet', () => {
    api.admin.decide(id, 'escalate', 'Needs the clinical lead')
    expect(updates()).toHaveLength(0)
    expect(getDb().portal!.review ?? null).toBeNull()
  })
  it('keeps member sanctions and therapist outcomes apart', () => {
    expect(api.admin.decide(id, 'strike', 'Wrong ladder')).toMatchObject({ ok: false, code: 'action' })
    expect(api.admin.decide('C-1042', 'pause-therapist', 'Not a therapist case')).toMatchObject({ ok: false, code: 'action' })
  })
})
