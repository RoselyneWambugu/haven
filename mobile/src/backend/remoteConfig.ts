import { config as mockConfig } from '@/api/content'
import type { FlagsCfg, LimitsCfg, MatchingCfg, PlanCfg, Res } from '@/api/types'
import { applyLimits, getDb, update } from '@/store/db'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

interface ServerPlan { id: string; label: string; days: number; priceKes: number | null; enabled: boolean; entitlements: PlanCfg['entitlements'] }
interface ConfigReply extends Reply {
  flags?: FlagsCfg
  limits?: LimitsCfg
  matching?: MatchingCfg
  topics?: string[]
  plans?: ServerPlan[]
  pendingPlans?: { id: string; plans: Partial<ServerPlan>[]; requestedBy: string; mine: boolean } | null
}

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

/** The server's version replaces what the app had, keeping the wording the server doesn't own (a plan's period and blurb). */
function mergePlans(current: PlanCfg[], server: Partial<ServerPlan>[]): PlanCfg[] {
  const by = new Map(server.map((p) => [p.id, p]))
  return current.map((p) => {
    const s = by.get(p.id)
    if (!s) return p
    return { ...p, label: s.label ?? p.label, days: s.days ?? p.days, priceKes: s.priceKes === undefined ? p.priceKes : s.priceKes, enabled: s.enabled ?? p.enabled, entitlements: s.entitlements ?? p.entitlements }
  })
}

/** What members read: the feature flags, limits, topics and plans. */
export async function syncConfig(): Promise<void> {
  const d = await call<ConfigReply>('app_config')
  if (!d.ok || !d.flags || !d.limits) return
  update((s) => ({
    content: { ...s.content, flags: d.flags!, limits: d.limits!, topics: d.topics?.length ? d.topics : s.content.topics, plans: d.plans ? mergePlans(s.content.plans, d.plans) : s.content.plans },
  }))
  applyLimits()
}

/** What an Admin edits, including matching and a plan change that is waiting for a second Admin. */
export async function syncAdminConfig(): Promise<void> {
  const d = await call<ConfigReply>('admin_config')
  if (!d.ok || !d.flags || !d.limits || !d.matching) return
  update((s) => {
    const plans = d.plans ? mergePlans(s.content.plans, d.plans) : s.content.plans
    return {
      content: {
        ...s.content, flags: d.flags!, limits: d.limits!, matching: d.matching!, topics: d.topics ?? s.content.topics, plans,
        pendingPlans: d.pendingPlans ? { plans: mergePlans(plans, d.pendingPlans.plans), requestedBy: d.pendingPlans.requestedBy, approvals: [], id: d.pendingPlans.id, mine: d.pendingPlans.mine } : null,
      },
    }
  })
  applyLimits()
}

async function act(fn: string, args: Record<string, unknown>): Promise<Res> {
  const r = await call(fn, args)
  await syncAdminConfig()
  return res(r)
}

export const remoteConfig = {
  ...mockConfig,
  addTopic: (name: string) => act('admin_add_topic', { p_name: name }),
  renameTopic: (from: string, to: string) => act('admin_rename_topic', { p_from: from, p_to: to }),
  retireTopic: (name: string) => act('admin_retire_topic', { p_name: name }),
  async proposePlans(plans: PlanCfg[]): Promise<Res<{ proposed: boolean }>> {
    const payload = plans.map((p) => ({ id: p.id, enabled: p.enabled, priceKes: p.priceKes, entitlements: p.entitlements }))
    const r = await call<Reply & { proposed?: boolean }>('admin_propose_plans', { p_plans: payload })
    await syncAdminConfig()
    return r.ok ? { ok: true, value: { proposed: r.proposed === true } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },
  approvePlans: () => act('admin_decide_plans', { p_id: getDb().content.pendingPlans?.id ?? '', p_approve: true }),
  declinePlans: () => act('admin_decide_plans', { p_id: getDb().content.pendingPlans?.id ?? '', p_approve: false }),
  withdrawPlans(): void {
    void act('admin_withdraw_plans', { p_id: getDb().content.pendingPlans?.id ?? '' })
  },
  setMatching: (m: MatchingCfg) => act('admin_set_matching', { p_neighbours: m.neighbourFallback, p_weight: m.softTopicWeight, p_cooldown: m.rematchCooldownDays }),
  setFlag: (key: keyof FlagsCfg, on: boolean) => act('admin_set_flag', { p_key: key, p_on: on }),
  setLimits: (l: LimitsCfg) => act('admin_set_limits', { p_grace: l.graceDays, p_pen_name: l.penNameChangeDays, p_deletion: l.deletionHoldDays }),
}
