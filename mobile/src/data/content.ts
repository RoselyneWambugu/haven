import type { ContentState, DepartmentCfg, PlanCfg } from '@/api/types'
import { FORUM_TOPICS } from '@/api/types'
import { ARTICLES, CRISIS_LINES, DEPARTMENTS, EMERGENCY, PLANS, POPULAR, SUPPORT_ORGS } from './help'

const OWNER: Record<string, DepartmentCfg['owner']> = {
  start: 'Support', account: 'Support', privacy: 'Support', safety: 'Moderation', billing: 'Billing', therapists: 'Clinical', forum: 'Support', tech: 'Tech', feedback: 'Support',
}
const SLA: Record<string, number> = { safety: 4, billing: 24, therapists: 24, tech: 48 }

/** The starting content and configuration. Everything here can be changed by staff without a release. */
export function defaultContent(): ContentState {
  const plans: PlanCfg[] = PLANS.map((p) => ({ ...p, enabled: true, entitlements: { disappearing: true, therapistDiscountPct: 0 } }))
  return {
    departments: DEPARTMENTS.map((d) => ({ ...d, owner: OWNER[d.id] ?? 'Support', slaHours: SLA[d.id] ?? 24, enabled: true })),
    articles: ARTICLES.map((a) => ({ ...a, published: true })),
    popular: [...POPULAR],
    emergency: { ...EMERGENCY },
    crisisLines: CRISIS_LINES.map((l, i) => ({ ...l, id: `cl${i + 1}` })),
    crisisVerifiedAt: null,
    supportOrgs: SUPPORT_ORGS.map((o) => ({ ...o, archived: false })),
    suggestions: [],
    topics: [...FORUM_TOPICS],
    plans,
    pendingPlans: null,
    matching: { neighbourFallback: true, softTopicWeight: 0, rematchCooldownDays: 30 },
    flags: { forum: true, moodCheckin: true, disappearing: true, therapistVideo: true },
    limits: { graceDays: 7, penNameChangeDays: 30, deletionHoldDays: 14 },
  }
}
