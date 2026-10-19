import { LIVE } from '@/data/config'
import type { Subscription } from '@/api/types'

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
