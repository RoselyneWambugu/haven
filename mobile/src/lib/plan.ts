import { LIVE } from '@/data/config'
import type { PlanCfg, Subscription } from '@/api/types'
import { MAX_PEER_CHATS } from './limits'

export type PlanState = 'none' | 'active' | 'ending' | 'lapsed'

/** active: paid and renewing. ending: cancelled but still paid for. lapsed: the paid period is over. */
export function planState(sub: Subscription | null, t: number): PlanState {
  if (!sub) return 'none'
  if (t >= sub.endsAt) return 'lapsed'
  return sub.cancelledAt || !sub.autoRenew ? 'ending' : 'active'
}

/** Peer chat needs a paid plan (PRD BIL-2). */
export const canChat = (s: PlanState): boolean => s === 'active' || s === 'ending'

export function graceEndsAt(sub: Subscription): number {
  return sub.endsAt + LIVE.graceDays * 24 * 3600_000
}

const DAY = 24 * 3600_000

/** Whole days left in the paid period (rounded up, so the last day still says 1), and 0 once it has ended. */
export function daysLeft(sub: Pick<Subscription, 'endsAt'>, t: number): number {
  return Math.max(0, Math.ceil((sub.endsAt - t) / DAY))
}

/** How much of the paid period has gone, from 0 to 1. */
export function periodUsed(sub: Pick<Subscription, 'startedAt' | 'endsAt'>, t: number): number {
  const total = sub.endsAt - sub.startedAt
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (t - sub.startedAt) / total))
}

/** "23 days left", "Ends today", "1 day left", "Ended". */
export function daysLeftLabel(sub: Pick<Subscription, 'endsAt'>, t: number): string {
  if (t >= sub.endsAt) return 'Ended'
  const d = daysLeft(sub, t)
  return d <= 1 && sub.endsAt - t < DAY ? 'Ends today' : `${d} ${d === 1 ? 'day' : 'days'} left`
}

/** What a plan gives, in plain words, from the plan's own settings. Everything else in Echo (urgent help, the help centre) is free. */
export function planIncludes(plan: Pick<PlanCfg, 'entitlements'>): string[] {
  const e = plan.entitlements
  const out = [
    `Peer chat: match with people who share your language, up to ${MAX_PEER_CHATS} chats at a time`,
    'Community: posts, gossip, polls and events',
    'Support spaces and group chats with a therapist',
    e.therapistDiscountPct > 0 ? `Therapist sessions at ${e.therapistDiscountPct}% off` : 'Book sessions with a verified therapist',
  ]
  if (e.disappearing) out.push('Disappearing messages')
  return out
}

export const ALWAYS_FREE = 'Urgent help and the help centre are always free, with or without a plan.'
