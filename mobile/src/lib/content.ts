import type { ArticleCfg, DepartmentCfg, DepartmentOwner, FlagsCfg, MatchingCfg, PlanCfg, StaffRole } from '@/api/types'

// ---------------------------------------------------------------------------
// Rules for the editable content and configuration (PRD §6.10, §6.11). Pure, so they can be tested.
// ---------------------------------------------------------------------------

/** Which team's departments each staff role works on (HLP-1a). Admin works on all of them. */
const OWNS: Record<StaffRole, DepartmentOwner[]> = {
  moderator: ['Moderation'],
  clinical: ['Clinical'],
  billing: ['Support', 'Billing'],
  admin: ['Support', 'Billing', 'Moderation', 'Clinical', 'Tech'],
}
export const ownedBy = (role: StaffRole, departments: DepartmentCfg[]): DepartmentCfg[] => departments.filter((d) => OWNS[role].includes(d.owner))
export const ownsDepartment = (role: StaffRole, d: DepartmentCfg | undefined): boolean => !!d && OWNS[role].includes(d.owner)

/** Who may change what in Resources. */
export const canEditDepartments = (role: StaffRole): boolean => role === 'admin'
export const canEditDirectory = (role: StaffRole): boolean => role === 'clinical' || role === 'admin'
export const canEditConfig = (role: StaffRole): boolean => role === 'admin'

// ---------- tickets ----------

export function ticketDue(createdAt: number, slaHours: number): number {
  return createdAt + slaHours * 3_600_000
}
export const isOverdue = (createdAt: number, slaHours: number, now: number): boolean => now > ticketDue(createdAt, slaHours)

// ---------- articles (HLP-5) ----------

export interface ArticleInput {
  title: string
  intro: string
  steps: string[]
  deptId: string
}

/** Titles read best as questions, but that is advice, not a rule. */
export function titleAdvice(title: string): string | null {
  return /\?\s*$/.test(title.trim()) ? null : 'Titles read best as a question, for example “How do I change my pen name?”'
}

export function validateArticle(a: ArticleInput): string | null {
  if (a.title.trim().length < 8 || a.title.trim().length > 90) return 'Give the article a title of 8 to 90 characters.'
  if (a.intro.trim().length < 10) return 'Add a short introduction.'
  const steps = a.steps.map((s) => s.trim()).filter(Boolean)
  if (!steps.length) return 'Add at least one step.'
  if (steps.some((s) => s.length < 5)) return 'Each step needs a few words.'
  if (!a.deptId) return 'Choose a department.'
  return null
}

export function slugify(title: string, taken: string[]): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'article'
  let id = base
  let n = 2
  while (taken.includes(id)) id = `${base}-${n++}`
  return id
}

export const splitSteps = (text: string): string[] => text.split('\n').map((s) => s.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean)

/** Members only see published articles in departments that are switched on. */
export function visibleArticles(articles: ArticleCfg[], departments: DepartmentCfg[]): ArticleCfg[] {
  const on = new Set(departments.filter((d) => d.enabled).map((d) => d.id))
  return articles.filter((a) => a.published && on.has(a.deptId))
}

// ---------- crisis lines and organisations (CRS-2, HLP-8) ----------

export const STALE_AFTER_DAYS = 90

export function verification(verifiedAt: number | null, now: number): { state: 'never' | 'ok' | 'stale'; days: number | null } {
  if (verifiedAt === null) return { state: 'never', days: null }
  const days = Math.floor((now - verifiedAt) / 86_400_000)
  return { state: days > STALE_AFTER_DAYS ? 'stale' : 'ok', days }
}

/** A number can be left blank while it is waiting to be confirmed. Otherwise digits, spaces, + and dashes. */
export function validatePhone(phone: string): string | null {
  const p = phone.trim()
  if (!p) return null
  if (!/^[+\d][\d\s-]{1,18}$/.test(p)) return 'Use digits only, with an optional + at the start.'
  const digits = p.replace(/\D/g, '').length
  return digits < 3 || digits > 15 ? 'A number has 3 to 15 digits.' : null
}

export function validateLine(l: { name: string; phone: string; hours: string; languages: string }): string | null {
  if (l.name.trim().length < 3) return 'Add the name of the service.'
  if (!l.hours.trim()) return 'Add when it is open.'
  if (!l.languages.trim()) return 'Add the languages it works in.'
  return validatePhone(l.phone)
}

// ---------- topics ----------

export function validateTopic(name: string, existing: string[]): string | null {
  const n = name.trim()
  if (n.length < 2 || n.length > 24) return 'A topic is 2 to 24 characters.'
  if (!/^[A-Za-z][A-Za-z ]*$/.test(n)) return 'Use letters and spaces only.'
  if (existing.some((t) => t.toLowerCase() === n.toLowerCase())) return 'That topic already exists.'
  return null
}

// ---------- plans (BIL-1, BIL-2) ----------

export function validatePlan(p: PlanCfg): string | null {
  if (p.label.trim().length < 2 || p.label.trim().length > 20) return 'A plan name is 2 to 20 characters.'
  if (p.priceKes !== null && (!Number.isInteger(p.priceKes) || p.priceKes <= 0 || p.priceKes > 1_000_000)) return 'A price is a whole number of shillings, up to 1,000,000. Leave it blank while it is undecided.'
  if (!Number.isInteger(p.entitlements.therapistDiscountPct) || p.entitlements.therapistDiscountPct < 0 || p.entitlements.therapistDiscountPct > 50) return 'A therapy discount is 0 to 50 percent.'
  return null
}

export function validatePlans(plans: PlanCfg[]): string | null {
  for (const p of plans) {
    const e = validatePlan(p)
    if (e) return `${p.label}: ${e}`
  }
  if (!plans.some((p) => p.enabled)) return 'Keep at least one plan switched on.'
  return null
}

/** What the plan screen lists under "Your plan includes", worked out from the entitlements. */
export function includesList(p: PlanCfg): string[] {
  const out = ['Automatic matching and unlimited peer chat', 'Posting and commenting in the community']
  if (p.entitlements.disappearing) out.push('Disappearing chats')
  if (p.entitlements.therapistDiscountPct > 0) out.push(`${p.entitlements.therapistDiscountPct}% off therapy sessions`)
  return out
}

// ---------- matching (MAT-1, MAT-3, MAT-7) ----------

/** Age range and a shared language are hard rules. They are shown, but they are not settings. */
export const HARD_RULES = ['Adults are only ever matched with adults, in the same or a neighbouring age range.', 'Both people must share at least one language.', 'Blocked, suspended and open Severity-1 members are never matched.']

export function validateMatching(m: MatchingCfg): string | null {
  if (!(m.softTopicWeight >= 0 && m.softTopicWeight <= 1)) return 'Topic weight is between 0 and 1.'
  if (!Number.isInteger(m.rematchCooldownDays) || m.rematchCooldownDays < 0 || m.rematchCooldownDays > 365) return 'The re-match wait is 0 to 365 days.'
  return null
}

// ---------- feature flags ----------

export const FLAGS: { key: keyof FlagsCfg; label: string; sub: string }[] = [
  { key: 'forum', label: 'Community posting', sub: 'When off, the community can be read but not posted to' },
  { key: 'moodCheckin', label: 'Home mood check-in', sub: 'Optional and private (D25, D48)' },
  { key: 'disappearing', label: 'Disappearing chats', sub: 'Both people must agree' },
  { key: 'therapistVideo', label: 'Video sessions', sub: 'When off, therapists are offered by chat and voice only' },
]

/** Safety features that can't be switched off from a settings page. */
export const ALWAYS_ON = ['Urgent help and crisis lines', 'Blocking contact details in messages', 'The distress support card', 'Reporting and blocking']

// ---------- limits ----------

export function validateLimits(l: { graceDays: number; penNameChangeDays: number; deletionHoldDays: number }): string | null {
  const ok = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi
  if (!ok(l.graceDays, 0, 60)) return 'Grace period is 0 to 60 days.'
  if (!ok(l.penNameChangeDays, 1, 365)) return 'Pen-name changes are limited to once every 1 to 365 days.'
  if (!ok(l.deletionHoldDays, 1, 60)) return 'The deletion holding period is 1 to 60 days.'
  return null
}

/** Session types on offer. With video switched off, therapists are offered by chat and voice only. */
export function modesFor<M extends string>(modes: M[], flags: Pick<FlagsCfg, 'therapistVideo'>): M[] {
  return modes.filter((m) => flags.therapistVideo || m !== 'video')
}
