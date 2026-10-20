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
