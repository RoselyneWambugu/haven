import type { Session } from '@/api/types'
import { MIN } from './booking'

/**
 * What happens to the money when a paid session is cancelled or missed. The money is held when the member pays and is shared out afterwards.
 * These are the starting values; the server holds the same ones in its configuration.
 */
export const SESSION_MONEY = {
  /** Cancelling inside this many minutes of the start is a late cancellation. */
  lateCancelMinutes: 60,
  /** What a late cancellation costs, as a percentage of what was paid. */
  lateCancelFeePct: 10,
  /** Of that fee, the share that goes to the therapist for the time they kept free. The rest is Echo's. */
  lateCancelTherapistSharePct: 50,
  /** A member who does not come: the share of the payment that goes back, and how the rest is shared. */
  noShowRefundPct: 85,
  noShowTherapistPct: 0,
  noShowPlatformPct: 15,
  /** How long a member waits for the therapist to join before they may leave with everything back. */
  therapistWaitMinutes: 15,
  /** What the app tells a member about how long a refund takes: to the same M-Pesa number, within this many working days. */
  refundWorkingDays: 3,
} as const

export type MoneyCase = 'free' | 'late-cancel' | 'member-no-show' | 'therapist-no-show'

/** Where one payment ends up. The three parts always add up to what was paid. */
export interface Split {
  kind: MoneyCase
  paidKes: number
  /** Goes back to the member's M-Pesa number. */
  refundKes: number
  /** The therapist's earnings from this session, before any payout. */
  therapistKes: number
  /** Echo keeps this. */
  platformKes: number
}

const pct = (n: number, p: number) => Math.round((n * p) / 100)

function make(kind: MoneyCase, paid: number, refund: number, therapist: number): Split {
  return { kind, paidKes: paid, refundKes: refund, therapistKes: therapist, platformKes: paid - refund - therapist }
}

/** Cancelled by the member. Free until the last hour; inside it a 10% fee is kept and the rest goes back. */
export function cancelSplit(start: number, at: number, paidKes: number): Split {
  if (start - at > SESSION_MONEY.lateCancelMinutes * MIN) return make('free', paidKes, paidKes, 0)
  const fee = pct(paidKes, SESSION_MONEY.lateCancelFeePct)
  return make('late-cancel', paidKes, paidKes - fee, pct(fee, SESSION_MONEY.lateCancelTherapistSharePct))
}

/** The member did not come. 85% goes back and Echo keeps the rest; the therapist earns nothing from it. */
export function memberNoShowSplit(paidKes: number): Split {
  return make('member-no-show', paidKes, pct(paidKes, SESSION_MONEY.noShowRefundPct), pct(paidKes, SESSION_MONEY.noShowTherapistPct))
}

/** The therapist did not come, or came too late. The member gets everything back and nobody earns. */
export function therapistNoShowSplit(paidKes: number): Split {
  return make('therapist-no-show', paidKes, paidKes, 0)
}

/** From this time on, a therapist who has not joined counts as late and the member may leave with a full refund. */
export function therapistLateAt(start: number): number {
  return start + SESSION_MONEY.therapistWaitMinutes * MIN
}

export function canReportTherapistLate(start: number, end: number, at: number): boolean {
  return at >= therapistLateAt(start) && at < end
}

/** Words for the cancel screen: what the member gets back, said before they confirm. */
export function cancelWords(split: Split, money: (n: number | null) => string): string {
  return split.kind === 'free'
    ? `You’re cancelling more than an hour before, so all ${money(split.refundKes)} goes back to your M-Pesa number.`
    : `It’s within the last hour, so a ${SESSION_MONEY.lateCancelFeePct}% fee (${money(split.paidKes - split.refundKes)}) is kept. ${money(split.refundKes)} goes back to your M-Pesa number.`
}

export const REFUND_NOTE = `Refunds go to the M-Pesa number you paid from, usually within a few minutes, and always within ${SESSION_MONEY.refundWorkingDays} working days.`

/** A therapist can mark a client a no-show only if the client never joined. Joining late still counts as joining. */
export const canMarkNoShow = (clientJoinedAt: number | null | undefined): boolean => !clientJoinedAt

/** After a therapist misses a session, the member's next booking with them is this much cheaper, for this long. The server holds the same values. */
export const FLAKE_DISCOUNT = { pct: 10, days: 90 } as const

export interface FlakeOffer {
  /** The missed session that earned the discount. */
  sessionId: string
  pct: number
  until: number
}

/** The discount waiting for this member with this therapist: from a session they missed, not yet used, not expired. */
export function flakeOffer(sessions: Pick<Session, 'id' | 'therapistId' | 'flaked' | 'flakeDiscountPct' | 'flakeDiscountUntil' | 'discountUsed'>[], therapistId: string, at: number): FlakeOffer | null {
  const hit = sessions
    .filter((s) => s.therapistId === therapistId && s.flaked && (s.flakeDiscountPct ?? 0) > 0 && !s.discountUsed && (s.flakeDiscountUntil ?? 0) > at)
    .sort((a, b) => (a.flakeDiscountUntil ?? 0) - (b.flakeDiscountUntil ?? 0))[0]
  return hit ? { sessionId: hit.id, pct: hit.flakeDiscountPct ?? 0, until: hit.flakeDiscountUntil ?? 0 } : null
}

export const discountedKes = (price: number, pct: number): number => Math.round((price * (100 - pct)) / 100)

/** When a therapist keeps missing sessions: counted over this many days, a warning at the first number, new clients paused at the second. The server holds the same. */
export const FLAKE_RULE = { windowDays: 60, warnAt: 2, pauseAt: 3 } as const

/** How many sessions this therapist has missed (the member left because they had not joined) in the last 60 days. */
export function missedIn(sessions: Pick<Session, 'therapistId' | 'flaked' | 'start'>[], therapistId: string, at: number): number {
  return sessions.filter((s) => s.therapistId === therapistId && s.flaked && s.start > at - FLAKE_RULE.windowDays * 24 * 60 * MIN).length
}

export type FlakeStanding = 'ok' | 'warning' | 'paused'

export function flakeStanding(missed: number): FlakeStanding {
  return missed >= FLAKE_RULE.pauseAt ? 'paused' : missed >= FLAKE_RULE.warnAt ? 'warning' : 'ok'
}

/** What the therapist is told. */
export function flakeNotice(missed: number): string {
  const days = FLAKE_RULE.windowDays
  if (flakeStanding(missed) === 'paused') return `New clients are paused because you missed ${missed} sessions in the last ${days} days: clients waited and you didn’t join. Your existing clients are not affected. A clinical reviewer will look at this and can lift the pause. You can appeal.`
  return `You missed ${missed} sessions in the last ${days} days: clients waited and you didn’t join. This is a warning. If you miss ${FLAKE_RULE.pauseAt - missed} more in that time, new clients will be paused. Each missed session also counts as a 1-star rating on your profile. You can appeal.`
}
