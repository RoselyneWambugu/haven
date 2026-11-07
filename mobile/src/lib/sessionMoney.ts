import type { Session, SessionMoneyCfg } from '@/api/types'

const MIN = 60_000

/** The starting values. An Admin can change them in Configuration; the server holds the same ones. */
export const DEFAULT_SESSION_MONEY: SessionMoneyCfg = {
  lateCancelMinutes: 60,
  lateCancelFeePct: 10,
  lateCancelTherapistSharePct: 50,
  noShowRefundPct: 85,
  noShowTherapistPct: 0,
  therapistWaitMinutes: 15,
  flakeDiscountPct: 10,
  flakeDiscountDays: 90,
  flakeWindowDays: 60,
  flakeWarnAt: 2,
  flakePauseAt: 3,
}

/**
 * What happens to the money when a paid session is cancelled or missed. The money is held when the member pays and is shared out afterwards.
 * These hold the live numbers: the app copies the configured ones in with applySessionMoney, the way it does for limits.
 */
export const SESSION_MONEY = {
  ...DEFAULT_SESSION_MONEY,
  /** Echo's share of a no-show: whatever is left after the refund and the therapist's share. */
  noShowPlatformPct: 100 - DEFAULT_SESSION_MONEY.noShowRefundPct - DEFAULT_SESSION_MONEY.noShowTherapistPct,
  /** What the app tells a member about how long a refund takes: to the same M-Pesa number, within this many working days. */
  refundWorkingDays: 3,
}

/** When a therapist keeps missing sessions: counted over this many days, a warning at the first number, new clients paused at the second (0 turns a step off). */
export const FLAKE_RULE = { windowDays: DEFAULT_SESSION_MONEY.flakeWindowDays, warnAt: DEFAULT_SESSION_MONEY.flakeWarnAt, pauseAt: DEFAULT_SESSION_MONEY.flakePauseAt }

/** After a therapist misses a session, the member's next booking with them is this much cheaper, for this long. */
export const FLAKE_DISCOUNT = { pct: DEFAULT_SESSION_MONEY.flakeDiscountPct, days: DEFAULT_SESSION_MONEY.flakeDiscountDays }

/** Copies the configured numbers to where the rules read them. Anything missing or not a number keeps its starting value. */
export function applySessionMoney(cfg: Partial<SessionMoneyCfg> | null | undefined): void {
  const c = { ...DEFAULT_SESSION_MONEY }
  for (const k of Object.keys(c) as (keyof SessionMoneyCfg)[]) {
    const v = cfg?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) c[k] = v
  }
  Object.assign(SESSION_MONEY, c, { noShowPlatformPct: 100 - c.noShowRefundPct - c.noShowTherapistPct })
  Object.assign(FLAKE_RULE, { windowDays: c.flakeWindowDays, warnAt: c.flakeWarnAt, pauseAt: c.flakePauseAt })
  Object.assign(FLAKE_DISCOUNT, { pct: c.flakeDiscountPct, days: c.flakeDiscountDays })
}

/** The same checks the server makes. Null when the numbers are fine, otherwise what to fix. */
export function validateSessionMoney(c: SessionMoneyCfg): string | null {
  const keys = Object.keys(DEFAULT_SESSION_MONEY) as (keyof SessionMoneyCfg)[]
  if (keys.some((k) => !Number.isInteger(c[k]))) return 'Every number needs a whole value.'
  const ok = (n: number, lo: number, hi: number) => n >= lo && n <= hi
  if (!ok(c.lateCancelMinutes, 0, 2880)) return 'A late cancellation starts 0 to 2880 minutes (2 days) before a session.'
  if (!ok(c.lateCancelFeePct, 0, 100)) return 'The cancellation fee is 0 to 100%.'
  if (!ok(c.lateCancelTherapistSharePct, 0, 100)) return 'The therapist’s share of the fee is 0 to 100%.'
  if (!ok(c.noShowRefundPct, 0, 100) || !ok(c.noShowTherapistPct, 0, 100)) return 'A no-show refund and the therapist’s share are 0 to 100%.'
  if (c.noShowRefundPct + c.noShowTherapistPct > 100) return 'The refund and the therapist’s share can’t add up to more than 100%.'
  if (!ok(c.therapistWaitMinutes, 5, 60)) return 'Members wait 5 to 60 minutes for a therapist.'
  if (!ok(c.flakeDiscountPct, 0, 50)) return 'The rebooking discount is 0 to 50%.'
  if (!ok(c.flakeDiscountDays, 1, 365)) return 'The discount lasts 1 to 365 days.'
  if (!ok(c.flakeWindowDays, 7, 365)) return 'Missed sessions are counted over 7 to 365 days.'
  if (!ok(c.flakeWarnAt, 0, 10) || !ok(c.flakePauseAt, 0, 20)) return 'A warning is at 0 to 10 missed sessions and a pause at 0 to 20 (0 turns it off).'
  if (c.flakeWarnAt > 0 && c.flakePauseAt > 0 && c.flakePauseAt <= c.flakeWarnAt) return 'A pause has to come after the warning.'
  return null
}

/** "the last hour", "the last 90 minutes", "the last 2 hours": how the app names the late-cancellation window. */
export function lastWindow(minutes: number = SESSION_MONEY.lateCancelMinutes): string {
  if (minutes === 60) return 'the last hour'
  if (minutes % 60 === 0) return `the last ${minutes / 60} hours`
  return `the last ${minutes} minutes`
}

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

/** Cancelled by the member. Free until the late-cancellation window; inside it the fee is kept (10% to start with) and the rest goes back. `cfg` lets Configuration preview a change. */
export function cancelSplit(start: number, at: number, paidKes: number, cfg: Pick<SessionMoneyCfg, 'lateCancelMinutes' | 'lateCancelFeePct' | 'lateCancelTherapistSharePct'> = SESSION_MONEY): Split {
  if (start - at > cfg.lateCancelMinutes * MIN) return make('free', paidKes, paidKes, 0)
  const fee = pct(paidKes, cfg.lateCancelFeePct)
  return make('late-cancel', paidKes, paidKes - fee, pct(fee, cfg.lateCancelTherapistSharePct))
}

/** The member did not come. Most goes back (85% to start with) and Echo keeps the rest; the therapist's share is 0 to start with. */
export function memberNoShowSplit(paidKes: number, cfg: Pick<SessionMoneyCfg, 'noShowRefundPct' | 'noShowTherapistPct'> = SESSION_MONEY): Split {
  return make('member-no-show', paidKes, pct(paidKes, cfg.noShowRefundPct), pct(paidKes, cfg.noShowTherapistPct))
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
