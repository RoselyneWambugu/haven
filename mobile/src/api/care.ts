import { hasPlan } from './access'
import { canBookTherapist } from '@/lib/limits'
import { THERAPISTS } from '@/data/seed'
import { cancelSplit, canReportTherapistLate, discountedKes, FLAKE_DISCOUNT, flakeNotice, flakeOffer, flakeStanding, lastWindow, missedIn, SESSION_MONEY, therapistNoShowSplit } from '@/lib/sessionMoney'
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
      return { ok: true, value: { title: `${plan.label} plan`, amountKes: plan.priceKes } }
    }
    const t = therapistOf(item.therapistId)
    if (!t || t.suspended) return { ok: false, error: 'That therapist is not available.' }
    if (!hasPlan()) return { ok: false, error: 'Booking a therapist needs an active plan.', code: 'needs-plan' }
    if (!canBookTherapist(db.conversations, db.sessions, t.id, now())) return { ok: false, error: 'You can work with one therapist at a time. Finish or cancel your sessions with your current therapist first, then you can choose someone else.', code: 'one-therapist' }
    if (!t.modes.includes(item.mode) || (item.mode === 'video' && !db.content.flags.therapistVideo)) return { ok: false, error: `${t.name} doesn’t offer that kind of session.` }
    const slot = slotsFor(t, db.sessions, now()).find((s) => s.start === item.start)
    if (!slot || !slot.modes.includes(item.mode)) return { ok: false, error: 'That time was just taken. Please pick another.', code: 'taken' }
    // A therapist who missed the member's last session: this booking is cheaper.
    const offer = flakeOffer(db.sessions, t.id, now())
    const amount = offer && t.priceKes !== null ? discountedKes(t.priceKes, offer.pct) : t.priceKes
    update({ checkout: { id: uid('co'), item, amountKes: amount, createdAt: now() } })
    return { ok: true, value: { title: offer ? `Session with ${t.name} (${offer.pct}% off because they missed your last session)` : `Session with ${t.name}`, amountKes: amount } }
  },

  /** Simulates M-Pesa or card. Takes a few seconds, like the real thing. */
  pay(method: PaymentMethod, _mpesaPhone?: string): Promise<PaymentResult> {
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
          priceKes: co.amountKes ?? th.priceKes, receiptNo: rcpt, createdAt: now(), rating: null, followUpOffer: null, lateChargeApplied: false,
        }
        // The discount is used up by paying for the booking it was given for.
        const usedOffer = flakeOffer(db.sessions, th.id, now())
        const sessionsNow = usedOffer && co.amountKes !== null && th.priceKes !== null && co.amountKes < th.priceKes ? db.sessions.map((x) => (x.id === usedOffer.sessionId ? { ...x, discountUsed: true } : x)) : db.sessions
        let conversations = db.conversations
        if (item.mode === 'chat' && !conversations.some((c) => c.therapistId === th.id)) {
          const conv: Conversation = {
            id: uid('c'), kind: 'therapist', peer: null, therapistId: th.id,
            messages: [{ id: uid('m'), from: 'system', text: `Session booked for ${dayAndClock(item.start)}. You can message ${th.name} here before then. Chats with a therapist are deleted every week, unless reported.`, at: now() }],
            muted: false, archived: false, ended: false, disappearing: 'off', unread: 0, createdAt: now(), lastAt: now(),
          }
          conversations = [conv, ...conversations]
        }
        update({ sessions: [...sessionsNow, session], conversations, checkout: null })
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
  cancel(id: string): Res<{ outcome: 'free' | 'late'; refundKes: number }> {
    const s = getDb().sessions.find((x) => x.id === id)
    if (!s || s.status !== 'booked') return { ok: false, error: 'That session can’t be changed.' }
    const split = cancelSplit(s.start, now(), s.priceKes ?? 0)
    const outcome = split.kind === 'free' ? 'free' : 'late'
    setSession(id, (x) => ({ ...x, status: 'cancelled', lateChargeApplied: outcome === 'late', refundKes: split.refundKes }))
    return { ok: true, value: { outcome, refundKes: split.refundKes } }
  },

  /** The therapist has not joined 15 minutes after the start: the member leaves with everything back. */
  reportTherapistLate(id: string): Res<{ refundKes: number }> {
    const s = getDb().sessions.find((x) => x.id === id)
    if (!s || s.status !== 'booked') return { ok: false, error: 'That session can’t be changed.' }
    if (!canReportTherapistLate(s.start, s.end, now())) return { ok: false, error: `Please wait ${SESSION_MONEY.therapistWaitMinutes} minutes after the start for your therapist to join.`, code: 'early' }
    const split = therapistNoShowSplit(s.priceKes ?? 0)
    setSession(id, (x) => ({ ...x, status: 'cancelled', lateChargeApplied: false, refundKes: split.refundKes, flaked: true, flakeDiscountPct: FLAKE_DISCOUNT.pct || null, flakeDiscountUntil: now() + FLAKE_DISCOUNT.days * DAY, discountUsed: false }))
    // A therapist who keeps missing sessions is warned, then paused. In the demo this reaches the portal if that therapist is the one signed in.
    const db = getDb()
    const missed = missedIn(db.sessions, s.therapistId, now())
    const standing = flakeStanding(missed)
    const portal = db.portal
    if (standing !== 'ok' && portal && portal.therapistId === s.therapistId && portal.review?.kind !== 'paused') {
      update({ portal: { ...portal, paused: standing === 'paused' ? true : portal.paused, review: { kind: standing, text: flakeNotice(missed), at: now(), by: 'System' } } })
    }
    return { ok: true, value: { refundKes: split.refundKes } }
  },

  reschedule(id: string, newStart: number): Res<{ outcome: 'free' | 'late' }> {
    const db = getDb()
    const s = db.sessions.find((x) => x.id === id)
    if (!s || s.status !== 'booked') return { ok: false, error: 'That session can’t be changed.' }
    if (changeOutcome(s.start, now()) === 'late') return { ok: false, error: `It’s within ${lastWindow()}, so it can’t be moved. You can cancel instead.`, code: 'late' }
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
