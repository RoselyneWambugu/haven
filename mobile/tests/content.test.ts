import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { LIVE } from '../src/data/config'
import { defaultContent } from '../src/data/content'
import { canEditConfig, canEditDirectory, includesList, isOverdue, ownedBy, slugify, splitSteps, ticketDue, titleAdvice, validateArticle, validateLimits, validateLine, validateMatching, validatePhone, validatePlan, validatePlans, validateTopic, verification, visibleArticles } from '../src/lib/content'
import { planState, graceEndsAt } from '../src/lib/plan'
import { advanceClock, now, resetClock } from '../src/lib/clock'
import { applyLimits, freshState, getDb, update } from '../src/store/db'

describe('who may edit what', () => {
  const d = defaultContent().departments
  it('gives each team its own departments, and Admin all of them', () => {
    expect(ownedBy('billing', d).map((x) => x.id)).toContain('billing')
    expect(ownedBy('billing', d).map((x) => x.id)).not.toContain('safety')
    expect(ownedBy('moderator', d).map((x) => x.id)).toEqual(['safety'])
    expect(ownedBy('clinical', d).map((x) => x.id)).toEqual(['therapists'])
    expect(ownedBy('admin', d).length).toBe(d.length)
  })
  it('limits the directory to clinical staff and configuration to Admin', () => {
    expect(canEditDirectory('clinical')).toBe(true)
    expect(canEditDirectory('moderator')).toBe(false)
    expect(canEditConfig('admin')).toBe(true)
    expect(canEditConfig('clinical')).toBe(false)
  })
})

describe('tickets', () => {
  it('works out the response target', () => {
    expect(ticketDue(0, 24)).toBe(24 * 3_600_000)
    expect(isOverdue(0, 24, 25 * 3_600_000)).toBe(true)
    expect(isOverdue(0, 24, 23 * 3_600_000)).toBe(false)
  })
})

describe('articles', () => {
  const ok = { title: 'How do I change my pen name?', intro: 'You can change it with a limit.', steps: ['Open Me', 'Choose a new name'], deptId: 'account' }
  it('needs a title, an introduction, steps and a department', () => {
    expect(validateArticle(ok)).toBeNull()
    expect(validateArticle({ ...ok, title: 'Hi' })).toMatch(/title/)
    expect(validateArticle({ ...ok, intro: '' })).toMatch(/introduction/)
    expect(validateArticle({ ...ok, steps: ['', '  '] })).toMatch(/step/)
    expect(validateArticle({ ...ok, steps: ['ok'] })).toMatch(/few words/)
    expect(validateArticle({ ...ok, deptId: '' })).toMatch(/department/)
  })
  it('advises questions without insisting', () => {
    expect(titleAdvice('How do I pay?')).toBeNull()
    expect(titleAdvice('Paying for a plan')).toMatch(/question/)
  })
  it('makes a unique, tidy id', () => {
    expect(slugify('How do I pay?', [])).toBe('how-do-i-pay')
    expect(slugify('How do I pay?', ['how-do-i-pay'])).toBe('how-do-i-pay-2')
    expect(slugify('???', [])).toBe('article')
  })
  it('turns typed text into steps, dropping numbering', () => {
    expect(splitSteps('1. Open Me\n2) Choose Settings\n\n  Done  ')).toEqual(['Open Me', 'Choose Settings', 'Done'])
  })
  it('hides unpublished articles and switched-off departments from members', () => {
    const c = defaultContent()
    const a = c.articles.map((x) => (x.id === 'refunds' ? { ...x, published: false } : x))
    const d = c.departments.map((x) => (x.id === 'tech' ? { ...x, enabled: false } : x))
    const ids = visibleArticles(a, d).map((x) => x.id)
    expect(ids).not.toContain('refunds')
    expect(ids).not.toContain('slow-app')
    expect(ids).toContain('how-echo-works')
  })
})

describe('crisis lines', () => {
  it('calls numbers stale after 90 days, or never checked', () => {
    const day = 86_400_000
    expect(verification(null, 0)).toEqual({ state: 'never', days: null })
    expect(verification(0, 30 * day)).toEqual({ state: 'ok', days: 30 })
    expect(verification(0, 91 * day).state).toBe('stale')
  })
  it('accepts a blank number while it is unconfirmed, and rejects nonsense', () => {
    expect(validatePhone('')).toBeNull()
    expect(validatePhone('0800 723 253')).toBeNull()
    expect(validatePhone('+254 20 2221 000')).toBeNull()
    expect(validatePhone('call me')).not.toBeNull()
    expect(validatePhone('12')).not.toBeNull()
    expect(validatePhone('1234567890123456')).not.toBeNull()
  })
  it('needs a name, hours and languages', () => {
    const l = { name: 'Helpline', phone: '', hours: '24 hours', languages: 'English' }
    expect(validateLine(l)).toBeNull()
    expect(validateLine({ ...l, name: '' })).toMatch(/name/)
    expect(validateLine({ ...l, hours: '' })).toMatch(/open/)
    expect(validateLine({ ...l, languages: '' })).toMatch(/languages/)
  })
})

describe('topics, plans, matching and limits', () => {
  it('keeps topics short, tidy and unique', () => {
    expect(validateTopic('Money', ['Grief'])).toBeNull()
    expect(validateTopic('x', [])).not.toBeNull()
    expect(validateTopic('Grief 2', [])).not.toBeNull()
    expect(validateTopic('grief', ['Grief'])).toMatch(/exists/)
  })
  const plan = defaultContent().plans[1]
  it('lets a price stay blank, but never be zero or fractional', () => {
    expect(validatePlan({ ...plan, priceKes: null })).toBeNull()
    expect(validatePlan({ ...plan, priceKes: 1500 })).toBeNull()
    expect(validatePlan({ ...plan, priceKes: 0 })).not.toBeNull()
    expect(validatePlan({ ...plan, priceKes: 99.5 })).not.toBeNull()
    expect(validatePlan({ ...plan, entitlements: { ...plan.entitlements, therapistDiscountPct: 80 } })).not.toBeNull()
  })
  it('keeps at least one plan on', () => {
    const off = defaultContent().plans.map((p) => ({ ...p, enabled: false }))
    expect(validatePlans(off)).toMatch(/at least one/)
  })
  it('lists what a plan includes from its entitlements', () => {
    expect(includesList(plan)).toContain('Disappearing chats')
    expect(includesList({ ...plan, entitlements: { disappearing: false, therapistDiscountPct: 0 } })).toEqual(['Automatic matching and unlimited peer chat', 'Posting and commenting in the community'])
  })
  it('bounds matching and limits', () => {
    expect(validateMatching({ neighbourFallback: true, softTopicWeight: 0.5, rematchCooldownDays: 30 })).toBeNull()
    expect(validateMatching({ neighbourFallback: true, softTopicWeight: 2, rematchCooldownDays: 30 })).not.toBeNull()
    expect(validateMatching({ neighbourFallback: true, softTopicWeight: 0, rematchCooldownDays: -1 })).not.toBeNull()
    expect(validateLimits({ graceDays: 7, penNameChangeDays: 30, deletionHoldDays: 14 })).toBeNull()
    expect(validateLimits({ graceDays: 90, penNameChangeDays: 30, deletionHoldDays: 14 })).not.toBeNull()
  })
})

const as = (name: string) => expect(api.admin.signIn(name, DEMO_MFA).ok).toBe(true)
const c = () => getDb().content

describe('content api', () => {
  beforeEach(() => {
    resetClock()
    update(freshState())
    applyLimits()
    as('S. Kamau')
  })

  it('lets a department owner edit its articles and no one else', () => {
    const input = { title: 'How do I get a receipt?', intro: 'Receipts are sent by text.', steps: ['Open Me', 'Choose My plan'], deptId: 'billing' }
    as('T. Njeri')
    expect(api.resources.saveArticle(input)).toMatchObject({ ok: false, code: 'role' })
    as('J. Otieno')
    const r = api.resources.saveArticle(input)
    expect(r.ok).toBe(true)
    expect(c().articles.some((a) => a.title === input.title)).toBe(true)
  })

  it('stamps the update date and keeps related links when editing', () => {
    as('J. Otieno')
    advanceClock(60 * 24)
    const before = c().articles.find((a) => a.id === 'refunds')!
    api.resources.saveArticle({ id: 'refunds', title: before.title, intro: before.intro, steps: ['Contact Billing', 'Wait for a reply'], deptId: before.deptId })
    const after = c().articles.find((a) => a.id === 'refunds')!
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt)
    expect(after.related).toEqual(before.related)
  })

  it('writes every change to the audit log', () => {
    api.resources.setPublished('slow-app', false)
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Unpublished article', target: 'slow-app' })
  })

  it('only lets Admin change departments, and never switch off Safety', () => {
    as('J. Otieno')
    expect(api.resources.saveDepartment('billing', { slaHours: 12 })).toMatchObject({ ok: false, code: 'role' })
    as('S. Kamau')
    expect(api.resources.saveDepartment('billing', { slaHours: 12 }).ok).toBe(true)
    expect(api.resources.saveDepartment('billing', { slaHours: 500 })).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.resources.saveDepartment('safety', { enabled: false })).toMatchObject({ ok: false, code: 'locked' })
    api.resources.moveDepartment('billing', -1)
    expect(c().departments[3].id).toBe('billing')
  })

  it('lets staff reply to tickets in their own departments, as Echo staff', () => {
    update({ tickets: [{ id: 'tk1', deptId: 'billing', subject: 'Charged twice', status: 'open', unread: false, createdAt: now(), routedToCrisis: false, messages: [{ id: 'm1', from: 'me', text: 'I was charged twice', at: now() }] }] })
    as('T. Njeri')
    expect(api.resources.replyTicket('tk1', 'We are looking into it')).toMatchObject({ ok: false, code: 'role' })
    as('J. Otieno')
    expect(api.resources.replyTicket('tk1', '   ')).toMatchObject({ ok: false, code: 'empty' })
    expect(api.resources.replyTicket('tk1', 'We have refunded the second charge.').ok).toBe(true)
    const t = getDb().tickets[0]
    expect(t).toMatchObject({ status: 'replied', unread: true })
    expect(t.messages.at(-1)).toMatchObject({ from: 'staff' })
    api.resources.resolveTicket('tk1')
    expect(getDb().tickets[0].status).toBe('resolved')
  })

  it('stops numbers being marked as checked while one is blank, and clears the check on any edit', () => {
    as('Dr. K. Mwende')
    expect(api.resources.markVerified()).toMatchObject({ ok: false, code: 'blank' })
    update((s) => ({ content: { ...s.content, emergency: { ...s.content.emergency, phone: '112' }, crisisLines: s.content.crisisLines.map((l) => ({ ...l, phone: '0800 000 111' })) } }))
    expect(api.resources.markVerified().ok).toBe(true)
    expect(c().crisisVerifiedAt).not.toBeNull()
    api.resources.saveCrisisLine({ id: 'cl1', name: 'Crisis line', phone: '0800 000 222', hours: '24 hours', languages: 'English' })
    expect(c().crisisVerifiedAt).toBeNull()
    as('T. Njeri')
    expect(api.resources.markVerified()).toMatchObject({ ok: false, code: 'role' })
  })

  it('takes a suggested service through review', () => {
    expect(api.suggestService('x', '').ok).toBe(false)
    expect(api.suggestService('Mind Matters Nairobi', 'Free counselling on Saturdays').ok).toBe(true)
    as('Dr. K. Mwende')
    const sg = c().suggestions[0]
    expect(sg.status).toBe('new')
    expect(api.resources.decideSuggestion(sg.id, true).ok).toBe(true)
    expect(c().suggestions[0].status).toBe('accepted')
    expect(c().supportOrgs.some((o) => o.name === 'Mind Matters Nairobi' && o.archived)).toBe(true)
    expect(api.resources.decideSuggestion(sg.id, false).ok).toBe(false)
  })

  it('renames a topic everywhere, and keeps at least three', () => {
    update({ posts: getDb().posts })
    const topic = c().topics[1]
    expect(api.config.renameTopic(topic, 'Bereavement').ok).toBe(true)
    expect(c().topics).toContain('Bereavement')
    expect(getDb().posts.every((p) => p.topic !== topic)).toBe(true)
    expect(api.config.addTopic('Bereavement')).toMatchObject({ ok: false, code: 'invalid' })
    while (c().topics.length > 3) api.config.retireTopic(c().topics[0])
    expect(api.config.retireTopic(c().topics[0])).toMatchObject({ ok: false, code: 'min' })
  })

  it('needs two different admins to change plans', () => {
    const plans = c().plans.map((p) => (p.id === 'monthly' ? { ...p, priceKes: 1800 } : p))
    as('J. Otieno')
    expect(api.config.proposePlans(plans)).toMatchObject({ ok: false, code: 'role' })
    as('S. Kamau')
    expect(api.config.proposePlans(plans).ok).toBe(true)
    expect(api.config.approvePlans()).toMatchObject({ ok: false, code: 'second-person' })
    expect(c().plans.find((p) => p.id === 'monthly')!.priceKes).toBe(1500)
    as('R. Achieng')
    expect(api.config.approvePlans().ok).toBe(true)
    expect(c().plans.find((p) => p.id === 'monthly')!.priceKes).toBe(1800)
    expect(c().pendingPlans).toBeNull()
  })

  it('refuses a plan change with an invalid price', () => {
    const plans = c().plans.map((p) => ({ ...p, priceKes: -5 }))
    expect(api.config.proposePlans(plans)).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('changes matching, flags and limits, and applies the limits at once', () => {
    expect(api.config.setMatching({ neighbourFallback: false, softTopicWeight: 0.4, rematchCooldownDays: 14 }).ok).toBe(true)
    expect(c().matching.neighbourFallback).toBe(false)
    expect(api.config.setMatching({ neighbourFallback: true, softTopicWeight: 3, rematchCooldownDays: 14 })).toMatchObject({ ok: false, code: 'invalid' })
    expect(api.config.setFlag('moodCheckin', false).ok).toBe(true)
    expect(c().flags.moodCheckin).toBe(false)
    expect(api.config.setLimits({ graceDays: 3, penNameChangeDays: 45, deletionHoldDays: 21 }).ok).toBe(true)
    expect(LIVE.graceDays).toBe(3)
    expect(LIVE.penNameChangeDays).toBe(45)
    const sub = { planId: 'monthly', startedAt: 0, endsAt: 1000, autoRenew: true, cancelledAt: null, method: 'mpesa', receiptNo: 'x' } as never
    expect(graceEndsAt(sub)).toBe(1000 + 3 * 86_400_000)
    expect(planState(sub, 2000)).toBe('lapsed')
    update(freshState())
    applyLimits()
    expect(LIVE.graceDays).toBe(7)
  })

  it('keeps configuration to Admin only', () => {
    for (const who of ['T. Njeri', 'Dr. K. Mwende', 'J. Otieno']) {
      as(who)
      expect(api.config.setFlag('forum', false)).toMatchObject({ ok: false, code: 'role' })
      expect(api.config.setMatching({ neighbourFallback: true, softTopicWeight: 0, rematchCooldownDays: 30 })).toMatchObject({ ok: false, code: 'role' })
      expect(api.config.setLimits({ graceDays: 7, penNameChangeDays: 30, deletionHoldDays: 14 })).toMatchObject({ ok: false, code: 'role' })
      expect(api.config.addTopic('Money')).toMatchObject({ ok: false, code: 'role' })
    }
  })
})
