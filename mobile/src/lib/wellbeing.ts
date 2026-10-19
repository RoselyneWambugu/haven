import type { AdminCase, Exposure, RotaWeek, StaffAccount, WellbeingCfg } from '@/api/types'

// ---------------------------------------------------------------------------
// Reviewer wellbeing (PRD ADM-5, CRS-7, risk table). Limits are placeholders until D27 is decided.
// ---------------------------------------------------------------------------

export const DEFAULT_WELLBEING: WellbeingCfg = { dailyLimit: 20, breakEvery: 8, breakMinutes: 10 }
export const WEEK = 7 * 86_400_000

export const emptyExposure = (): Exposure => ({ count: 0, sinceBreak: 0, breakUntil: null })

export const onBreak = (e: Exposure | undefined, now: number): boolean => !!e?.breakUntil && e.breakUntil > now
export const atLimit = (e: Exposure | undefined, cfg: WellbeingCfg): boolean => (e?.count ?? 0) >= cfg.dailyLimit
/** A break is suggested, not forced. */
export const breakSuggested = (e: Exposure | undefined, cfg: WellbeingCfg, now: number): boolean => !onBreak(e, now) && (e?.sinceBreak ?? 0) >= cfg.breakEvery

export function validateWellbeing(c: WellbeingCfg): string | null {
  const ok = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi
  if (!ok(c.dailyLimit, 5, 100)) return 'The daily limit is 5 to 100 reveals.'
  if (!ok(c.breakEvery, 2, 50) || c.breakEvery > c.dailyLimit) return 'A break is suggested every 2 to 50 reveals, and no more than the daily limit.'
  if (!ok(c.breakMinutes, 1, 60)) return 'A break is 1 to 60 minutes.'
  return null
}

/** Severity-1 and crisis cases are the heaviest content. Only people on the rota work them, plus clinical staff and Admins. */
export const isHeavy = (c: Pick<AdminCase, 'severity' | 'source'>): boolean => c.severity === 'S1' || c.source === 'crisis-flag'

export function canTakeCase(c: Pick<AdminCase, 'severity' | 'source'>, who: Pick<StaffAccount, 'name' | 'role'>, rotaThisWeek: string[]): boolean {
  if (!isHeavy(c)) return true
  return who.role !== 'moderator' || rotaThisWeek.includes(who.name)
}

/** Who works the heavy queue next week: moderators who were not on it this week come first, so it rotates. */
export function nextRota(prev: string[], moderators: string[], size: number): string[] {
  const fresh = moderators.filter((m) => !prev.includes(m))
  const rest = moderators.filter((m) => prev.includes(m))
  return [...fresh, ...rest].slice(0, Math.min(size, moderators.length))
}

export function weekOf(rota: RotaWeek[], now: number): RotaWeek | undefined {
  return rota.find((r) => now >= r.weekStart && now < r.weekStart + WEEK)
}

/** The Monday of the week (EAT) that contains `now`. */
export function mondayStart(now: number): number {
  const EAT = 3 * 3_600_000
  const d = new Date(now + EAT)
  const dow = (d.getUTCDay() + 6) % 7
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
  return start - EAT
}
