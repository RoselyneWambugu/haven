import { THERAPISTS } from '@/data/seed'
import { changeOutcome, canJoin, SESSION_MINUTES, MIN } from '@/lib/booking'
import { now } from '@/lib/clock'
import { slotsFor } from '@/lib/directory'
import { uid } from '@/lib/id'
import { planState } from '@/lib/plan'
import { dayAndClock } from '@/lib/time'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import type { CheckoutItem, Conversation, PaymentMethod, PaymentResult, Res, Session, Subscription } from './types'

const DAY = 24 * 3600_000
const plansNow = () => getDb().content.plans
const therapistOf = (id: string) => THERAPISTS.find((t) => t.id === id)
const receipt = () => `EC-${String(Math.floor(100000 + Math.random() * 900000))}`

// ---------------------------------------------------------------------------
// checkout and payment (PRD BIL-12 to BIL-16)
// ---------------------------------------------------------------------------

export const billing = {
  createCheckout(item: CheckoutItem): Res<{ title: string; amountKes: number | null }> {
    const db = getDb()
    if (!db.account) return { ok: false, error: 'Sign in first.' }
    if (item.kind === 'plan') {
      const plan = plansNow().find((p) => p.id === item.planId && p.enabled)
      if (!plan) return { ok: false, error: 'That plan is not available.' }
      update({ checkout: { id: uid('co'), item, amountKes: plan.priceKes, createdAt: now() } })
      return { ok: true, value: { title: `${plan.label} peer plan`, amountKes: plan.priceKes } }
    }
    const t = therapistOf(item.therapistId)
    if (!t || t.suspended) return { ok: false, error: 'That therapist is not available.' }
    if (!t.modes.includes(item.mode) || (item.mode === 'video' && !db.content.flags.therapistVideo)) return { ok: false, error: `${t.name} doesn’t offer that kind of session.` }
    const slot = slotsFor(t, db.sessions, now()).find((s) => s.start === item.start)
    if (!slot || !slot.modes.includes(item.mode)) return { ok: false, error: 'That time was just taken. Please pick another.', code: 'taken' }
    update({ checkout: { id: uid('co'), item, amountKes: t.priceKes, createdAt: now() } })
    return { ok: true, value: { title: `Session with ${t.name}`, amountKes: t.priceKes } }
  },

  /** Simulates M-Pesa or card. Takes a few seconds, like the real thing. */
  pay(method: PaymentMethod): Promise<PaymentResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const db = getDb()
        const co = db.checkout
        if (!co) return resolve({ ok: false, failure: 'cancelled' })
        if (db.demo.failNextPayment) {
          update((s) => ({ demo: { ...s.demo, failNextPayment: false } }))
          return resolve({ ok: false, failure: 'timeout' })
        }
        const rcpt = receipt()
        if (co.item.kind === 'plan') {
          const item = co.item
          const plan = plansNow().find((p) => p.id === item.planId)!
          const t = now()
          const cur = db.subscription
          const start = cur && cur.endsAt > t ? cur.endsAt : t
          const sub: Subscription = {
            planId: plan.id, startedAt: t, endsAt: start + plan.days * DAY, autoRenew: item.autoRenew,
            cancelledAt: null, method, receiptNo: rcpt,
          }
          update({ subscription: sub, checkout: null })
          return resolve({ ok: true, receiptNo: rcpt })
        }
        const item = co.item
        const th = therapistOf(item.therapistId)!
        const session: Session = {
          id: uid('s'), therapistId: th.id, mode: item.mode, start: item.start, end: item.start + SESSION_MINUTES * MIN, status: 'booked',
          priceKes: th.priceKes, receiptNo: rcpt, createdAt: now(), rating: null, followUpOffer: null, lateChargeApplied: false,
        }
        let conversations = db.conversations
        if (item.mode === 'chat' && !conversations.some((c) => c.therapistId === th.id)) {
          const conv: Conversation = {
            id: uid('c'), kind: 'therapist', peer: null, therapistId: th.id,
            messages: [{ id: uid('m'), from: 'system', text: `Session booked for ${dayAndClock(item.start)}. You can message ${th.name} here before then.`, at: now() }],
            muted: false, archived: false, ended: false, disappearing: 'off', unread: 0, createdAt: now(), lastAt: now(),
          }
          conversations = [conv, ...conversations]
        }
        update({ sessions: [...db.sessions, session], conversations, checkout: null })
        resolve({ ok: true, receiptNo: rcpt, sessionId: session.id })
      }, 2800)
    })
  },

  cancelCheckout(): void {
    update({ checkout: null })
  },

  cancelPlan(): void {
    const sub = getDb().subscription
    if (!sub) return
    update({ subscription: { ...sub, autoRenew: false, cancelledAt: now() } })
  },
  setAutoRenew(on: boolean): void {
    const sub = getDb().subscription
    if (!sub) return
    update({ subscription: { ...sub, autoRenew: on, cancelledAt: on ? null : sub.cancelledAt } })
  },
}

// ---------------------------------------------------------------------------
// sessions (PRD THR-26 to THR-31)
// ---------------------------------------------------------------------------

function setSession(id: string, fn: (s: Session) => Session) {
  update((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? fn(x) : x)) }))
}

export const sessions = {
  cancel(id: string): Res<{ outcome: 'free' | 'late' }> {
    const s = getDb().sessions.find((x) => x.id === id)
    if (!s || s.status !== 'booked') return { ok: false, error: 'That session can’t be changed.' }
    const outcome = changeOutcome(s.start, now())
    setSession(id, (x) => ({ ...x, status: 'cancelled', lateChargeApplied: outcome === 'late' }))
    return { ok: true, value: { outcome } }
  },

  reschedule(id: string, newStart: number): Res<{ outcome: 'free' | 'late' }> {
    const db = getDb()
    const s = db.sessions.find((x) => x.id === id)
    if (!s || s.status !== 'booked') return { ok: false, error: 'That session can’t be changed.' }
    const t = therapistOf(s.therapistId)
    if (!t) return { ok: false, error: 'That therapist is not available.' }
    const others = db.sessions.filter((x) => x.id !== id)
    const slot = slotsFor(t, others, now()).find((x) => x.start === newStart)
    if (!slot || !slot.modes.includes(s.mode)) return { ok: false, error: 'That time isn’t available. Please pick another.', code: 'taken' }
    const outcome = changeOutcome(s.start, now())
    setSession(id, (x) => ({ ...x, start: newStart, end: newStart + SESSION_MINUTES * MIN, lateChargeApplied: outcome === 'late' }))
    return { ok: true, value: { outcome } }
  },

  join(id: string): Res {
    const s = getDb().sessions.find((x) => x.id === id)
    if (!s || s.status !== 'booked') return { ok: false, error: 'This session can’t be joined.' }
    if (!canJoin(s.start, s.end, now())) return { ok: false, error: 'The session isn’t open yet.', code: 'early' }
    return { ok: true, value: undefined }
  },

  end(id: string): void {
    setSession(id, (x) => ({ ...x, status: 'completed', followUpOffer: x.followUpOffer ?? x.start + 7 * DAY }))
  },

  rate(id: string, stars: number, comment: string): void {
    setSession(id, (x) => ({ ...x, rating: { stars, comment } }))
    showToast('Thank you. Your feedback is private.')
  },
}

export { planState }
