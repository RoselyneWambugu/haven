import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { THERAPISTS } from '../src/data/seed'
import { resetClock } from '../src/lib/clock'
import { afterAppeal, canSeeAppeal, currentDecision, validateStatement } from '../src/lib/therapistAppeal'
import { freshState, getDb, update } from '../src/store/db'

describe('appeal rules', () => {
  it('steps a decision down one level when reduced, and removes it when overturned', () => {
    expect(afterAppeal('suspended', 'reduced')).toEqual({ review: 'paused', suspended: false })
    expect(afterAppeal('paused', 'reduced')).toEqual({ review: 'warning', suspended: false })
    expect(afterAppeal('warning', 'reduced')).toEqual({ review: null, suspended: false })
    for (const k of ['warning', 'paused', 'suspended'] as const) expect(afterAppeal(k, 'overturned')).toEqual({ review: null, suspended: false })
  })
  it('leaves the decision in force when upheld', () => {
    expect(afterAppeal('suspended', 'upheld')).toEqual({ review: null, suspended: true })
    expect(afterAppeal('paused', 'upheld')).toEqual({ review: 'paused', suspended: false })
  })
  it('appeals the most serious decision first', () => {
    const review = { kind: 'warning' as const, text: 'w', at: 1, by: 'A' }
    expect(currentDecision(review, undefined)?.kind).toBe('warning')
    expect(currentDecision(review, { reason: 'r', by: 'B', at: 2 })).toMatchObject({ kind: 'suspended', by: 'B' })
    expect(currentDecision(null, undefined)).toBeNull()
  })
  it('needs a real statement', () => {
    expect(validateStatement('too short')).not.toBeNull()
    expect(validateStatement('x'.repeat(2001))).not.toBeNull()
    expect(validateStatement('I raised the boundary issue with the client myself.')).toBeNull()
  })
  it('keeps therapist appeals from moderators and billing', () => {
    expect(canSeeAppeal('moderator', { therapistId: 't' })).toBe(false)
    expect(canSeeAppeal('billing', { therapistId: 't' })).toBe(false)
    expect(canSeeAppeal('clinical', { therapistId: 't' })).toBe(true)
    expect(canSeeAppeal('moderator', {})).toBe(true)
  })
})

describe('a therapist appeals', () => {
  let me = ''
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    for (const t of THERAPISTS) { t.suspended = false; t.acceptingNew = true }
    api.portal.signIn()
    me = getDb().portal!.therapistId
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
  })
  const STATEMENT = 'I raised the boundary issue with the client myself and noted it.'

  it('has nothing to appeal until a decision is made', () => {
    expect(api.therapistAppeals.submit(STATEMENT)).toMatchObject({ ok: false, code: 'none' })
  })
  it('can appeal a suspension once, and a different reviewer must decide it', () => {
    api.admin.suspendTherapist(me, 'Licence suspended by the regulator')
    expect(api.therapistAppeals.submit('short')).toMatchObject({ ok: false, code: 'statement' })
    expect(api.therapistAppeals.submit(STATEMENT).ok).toBe(true)
    expect(api.therapistAppeals.submit(STATEMENT)).toMatchObject({ ok: false, code: 'open' })
    const ap = api.admin.appeals().find((a) => a.therapistId === me)!
    expect(ap).toMatchObject({ status: 'open', decidedBy: 'Dr. K. Mwende' })
    expect(api.admin.decideAppeal(ap.id, 'overturned', 'Licence is valid; reinstating.')).toMatchObject({ ok: false, code: 'same-reviewer' })
    api.admin.signIn('S. Kamau', DEMO_MFA)
    expect(api.admin.decideAppeal(ap.id, 'overturned', 'Licence is valid; reinstating.').ok).toBe(true)
    expect(getDb().admin!.therapistStanding?.[me]).toBeUndefined()
    expect(THERAPISTS.find((t) => t.id === me)!.suspended).toBe(false)
    expect(api.therapistAppeals.latest()).toMatchObject({ status: 'overturned', response: 'Licence is valid; reinstating.' })
  })
  it('a reduced suspension becomes a pause, and an upheld one stays', () => {
    api.admin.suspendTherapist(me, 'Licence suspended by the regulator')
    api.therapistAppeals.submit(STATEMENT)
    const ap = api.admin.appeals().find((a) => a.therapistId === me)!
    api.admin.signIn('S. Kamau', DEMO_MFA)
    api.admin.decideAppeal(ap.id, 'reduced', 'Pausing new clients while this is checked.')
    expect(getDb().admin!.therapistStanding?.[me]).toBeUndefined()
    expect(getDb().portal).toMatchObject({ paused: true, review: { kind: 'paused', by: 'S. Kamau' } })
    expect(THERAPISTS.find((t) => t.id === me)!.acceptingNew).toBe(false)
  })
  it('an upheld appeal changes nothing and the answer is visible to the therapist', () => {
    api.admin.suspendTherapist(me, 'Licence suspended by the regulator')
    api.therapistAppeals.submit(STATEMENT)
    const ap = api.admin.appeals().find((a) => a.therapistId === me)!
    api.admin.signIn('S. Kamau', DEMO_MFA)
    api.admin.decideAppeal(ap.id, 'upheld', 'The regulator’s decision stands.')
    expect(getDb().admin!.therapistStanding?.[me]).toBeDefined()
    expect(api.therapistAppeals.latest()).toMatchObject({ status: 'upheld', response: 'The regulator’s decision stands.' })
  })
  it('hides therapist appeals from moderators, who cannot decide them', () => {
    api.admin.suspendTherapist(me, 'Licence suspended by the regulator')
    api.therapistAppeals.submit(STATEMENT)
    const id = api.admin.appeals().find((a) => a.therapistId === me)!.id
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.admin.appeals().some((a) => a.therapistId)).toBe(false)
    expect(api.admin.decideAppeal(id, 'upheld', 'Not mine to decide here.').ok).toBe(false)
  })
  it('can appeal a clinical pause from a concern, then a reduced pause becomes a warning', () => {
    update((s) => (s.portal ? { portal: { ...s.portal, paused: true, review: { kind: 'paused', text: 'Paused', at: 1, by: 'Dr. K. Mwende' } } } : {}))
    expect(api.therapistAppeals.decision()).toMatchObject({ kind: 'paused' })
    api.therapistAppeals.submit(STATEMENT)
    const id = api.admin.appeals().find((a) => a.therapistId === me)!.id
    api.admin.signIn('S. Kamau', DEMO_MFA)
    api.admin.decideAppeal(id, 'reduced', 'A warning is enough for this.')
    expect(getDb().portal).toMatchObject({ paused: false, review: { kind: 'warning' } })
  })
})
