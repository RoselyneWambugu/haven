import type { StaffRole } from '@/api/types'

// ---------------------------------------------------------------------------
// Analytics (PRD §2.3, §6.11, §11). Everything here works on counts and rates only: no message content, no
// identities, pseudonymous aggregates. Small cells are hidden so a breakdown can't point at a person (PRV-6).
// The numbers in the demo are generated, and the screens say so.
// ---------------------------------------------------------------------------

export type Range = 7 | 30 | 90
export const RANGES: Range[] = [7, 30, 90]
export const DAY = 86_400_000

export type Section = 'product' | 'care' | 'commercial' | 'safety'
export const SECTIONS: { key: Section; label: string; roles: StaffRole[] }[] = [
  { key: 'product', label: 'Product', roles: ['admin'] },
  { key: 'care', label: 'Care', roles: ['admin', 'clinical'] },
  { key: 'commercial', label: 'Commercial', roles: ['admin', 'billing'] },
  { key: 'safety', label: 'Safety', roles: ['admin', 'moderator', 'clinical'] },
]
export const sectionsFor = (role: StaffRole): Section[] => SECTIONS.filter((s) => s.roles.includes(role)).map((s) => s.key)

/** A cell with fewer people than this is hidden. */
export const MIN_CELL = 10
export const suppress = (n: number, k = MIN_CELL): number | null => (n < k ? null : n)

// ---------- helpers ----------

/** The p-th percentile (0 to 100), by linear interpolation. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const i = (p / 100) * (v.length - 1)
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return v[lo] + (v[hi] - v[lo]) * (i - lo)
}

export const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null)

/** Change against the previous period, as a fraction. Null when there is nothing to compare with. */
export function change(cur: number, prev: number): number | null {
  return prev > 0 ? (cur - prev) / prev : null
}

export const pct = (x: number | null, digits = 0): string => (x === null ? '—' : `${(x * 100).toFixed(digits)}%`)
export const compact = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n >= 1000 ? n.toLocaleString('en-US') : String(Math.round(n)))

/** Small deterministic random numbers, so the demo shows the same story every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- the demo dataset ----------

export interface Day {
  t: number
  installs: number
  registered: number
  verified: number
  profiled: number
  matched: number
  firstMessage: number
  subscribed: number
  active: number
  dirViews: number
  bookings: number
  sessions: number
  ratings: number
  conversations: number
  reports: number
  blocks: number
  renewals: number
  churned: number
  refunds: number
}

export type Totals = Omit<Day, 't'>
export const DAY_KEYS: (keyof Totals)[] = ['installs', 'registered', 'verified', 'profiled', 'matched', 'firstMessage', 'subscribed', 'active', 'dirViews', 'bookings', 'sessions', 'ratings', 'conversations', 'reports', 'blocks', 'renewals', 'churned', 'refunds']

/** 180 days ending at `anchor` (the start of today), so a 90 day view can still compare with the 90 before it. */
export function buildDays(anchor: number, seed = 7): Day[] {
  const r = rng(seed)
  const days: Day[] = []
  for (let i = 179; i >= 0; i--) {
    const t = anchor - i * DAY
    const weekday = new Date(t).getUTCDay()
    const wk = weekday === 0 || weekday === 6 ? 0.82 : 1.05
    const growth = 1 + (179 - i) / 180 * 0.7
    const noise = () => 0.9 + r() * 0.2
    const installs = Math.round(52 * growth * wk * noise())
    const step = (from: number, f: number) => Math.round(from * f * noise())
    const registered = step(installs, 0.62)
    const verified = step(registered, 0.9)
    const profiled = step(verified, 0.92)
    const matched = step(profiled, 0.82)
    const firstMessage = step(matched, 0.8)
    const subscribed = step(firstMessage, 0.27)
    const active = Math.round(150 * growth * wk * noise())
    const conversations = Math.round(active * 0.7 * noise())
    days.push({
      t, installs, registered, verified, profiled, matched, firstMessage, subscribed, active,
      dirViews: Math.round(active * 0.22 * noise()),
      bookings: Math.round(active * 0.017 * noise()),
      sessions: Math.round(active * 0.0155 * noise()),
      ratings: Math.round(active * 0.012 * noise()),
      conversations,
      reports: Math.round(conversations * 0.014 * noise()),
      blocks: Math.round(conversations * 0.031 * noise()),
      renewals: Math.round(subscribed * 3.1 * noise()),
      churned: Math.round(subscribed * 0.24 * noise()),
      refunds: r() < 0.16 ? 1 : 0,
    })
  }
  return days
}

export function sum(days: Day[], range: Range, offset: 0 | 1 = 0): Totals {
  const end = days.length - offset * range
  const slice = days.slice(Math.max(0, end - range), end)
  const out = {} as Totals
  for (const k of DAY_KEYS) out[k] = slice.reduce((n, d) => n + d[k], 0)
  return out
}

export function series(days: Day[], key: keyof Totals, range: number): number[] {
  return days.slice(-range).map((d) => d[key])
}

// ---------- derived figures ----------

export interface FunnelStep {
  label: string
  count: number
  ofPrev: number | null
  ofFirst: number | null
}

export function funnel(steps: { label: string; count: number }[]): FunnelStep[] {
  return steps.map((s, i) => ({ ...s, ofPrev: i === 0 ? null : ratio(s.count, steps[i - 1].count), ofFirst: i === 0 ? null : ratio(s.count, steps[0].count) }))
}

export const memberFunnel = (t: Totals): FunnelStep[] =>
  funnel([
    { label: 'Installed', count: t.installs },
    { label: 'Registered', count: t.registered },
    { label: 'Verified phone', count: t.verified },
    { label: 'Chose age and language', count: t.profiled },
    { label: 'Matched', count: t.matched },
    { label: 'Sent a first message', count: t.firstMessage },
    { label: 'Subscribed', count: t.subscribed },
  ])

export const therapyFunnel = (t: Totals): FunnelStep[] =>
  funnel([
    { label: 'Viewed the directory', count: t.dirViews },
    { label: 'Booked a session', count: t.bookings },
    { label: 'Attended a session', count: t.sessions },
    { label: 'Rated it', count: t.ratings },
  ])

export interface Cohort {
  label: string
  size: number
  d1: number | null
  d7: number | null
  d30: number | null
}

/** Eight weekly sign-up cohorts. A cohort only has a figure once enough days have passed. */
export function cohorts(anchor: number, seed = 11): Cohort[] {
  const r = rng(seed)
  const out: Cohort[] = []
  for (let w = 7; w >= 0; w--) {
    const start = anchor - (w + 1) * 7 * DAY
    const ageDays = w * 7 + 7
    const jitter = () => (r() - 0.5) * 0.06
    const size = Math.round(190 + (7 - w) * 14 + r() * 30)
    out.push({
      label: new Date(start).toISOString().slice(5, 10),
      size,
      d1: ageDays >= 1 ? 0.38 + jitter() : null,
      d7: ageDays >= 14 ? 0.22 + jitter() : null,
      d30: ageDays >= 37 ? 0.11 + jitter() : null,
    })
  }
  return out
}

/** Which of the four ramp steps a retention figure falls in, or -1 for no data. */
export function retentionBin(x: number | null, max: number): number {
  if (x === null) return -1
  const f = x / max
  return f < 0.4 ? 0 : f < 0.7 ? 1 : f < 0.9 ? 2 : 3
}

export interface Breakdown {
  rows: string[]
  cols: string[]
  cells: (number | null)[][]
}

/** Active members by age range and language. Cells under the minimum are hidden. */
export function whoIsUsing(seed = 5): Breakdown {
  const r = rng(seed)
  const rows = ['18–24', '25–34', '35–44', '45–54', '55+']
  const cols = ['English', 'Kiswahili', 'Sheng', 'Kikuyu', 'Dholuo']
  const weight = [0.26, 0.38, 0.2, 0.1, 0.06]
  const lang = [0.58, 0.28, 0.07, 0.04, 0.03]
  const total = 1240
  return { rows, cols, cells: rows.map((_, i) => cols.map((_, j) => suppress(Math.round(total * weight[i] * lang[j] * (0.85 + r() * 0.3))))) }
}

/** Minutes to first review for Severity-1 reports. Used for the median and the 95th percentile. */
export function reviewMinutes(seed = 3): number[] {
  const r = rng(seed)
  return Array.from({ length: 60 }, () => Math.round(4 + Math.pow(r(), 2.2) * 55))
}

export function histogram(values: number[], edges: number[]): { label: string; count: number }[] {
  return edges.slice(0, -1).map((lo, i) => ({
    label: i === edges.length - 2 ? `${lo}+` : `${lo}–${edges[i + 1] - 1}`,
    count: values.filter((v) => v >= lo && (i === edges.length - 2 || v < edges[i + 1])).length,
  }))
}

// ---------- export ----------

export const canExportAnalytics = (role: StaffRole): boolean => role === 'admin'

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map((c) => (c === null ? '' : typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(',')).join('\n')
}
