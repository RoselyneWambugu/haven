import { now } from '@/lib/clock'
import { canChat, planState } from '@/lib/plan'
import { getDb } from '@/store/db'
import type { Res } from './types'

/** Whether the signed-in member has an active paid plan. The whole platform needs one, except safety, help and billing. */
export const hasPlan = (): boolean => canChat(planState(getDb().subscription, now()))

/** An error to return when a paid feature is used without a plan, or null when the member may go ahead. */
export function requirePlan(what: string): Res | null {
  return hasPlan() ? null : { ok: false, error: `${what} needs an active plan.`, code: 'needs-plan' }
}
