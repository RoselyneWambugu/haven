import type { Settings } from '@/api/types'
import { eat, fromEat } from './time'

export type NoteCategory = 'message' | 'session' | 'forum' | 'plan' | 'safety' | 'account'

export interface AppNote {
  id: string
  /** Makes a note appear once however often it is derived. */
  key: string
  category: NoteCategory
  title: string
  body: string
  /** Where tapping it goes. */
  href: string
  at: number
  /** When it may be shown. Later than `at` while quiet hours hold it back. */
  deliverAt: number
  read: boolean
  /** Over the hourly cap: kept in the list but not counted as new (NTF-2). */
  silent: boolean
}

/** Safety and account notices can't be switched off or held back (PRD SET-4). */
export const ALWAYS: NoteCategory[] = ['safety', 'account']
export const QUIET_START = 22
export const QUIET_END = 7
/** At most this many notes an hour count as new, apart from safety and account notices (NTF-2). */
export const HOURLY_CAP = 5

const FLAG: Partial<Record<NoteCategory, keyof Settings>> = { message: 'notifyMessages', session: 'notifySessions', forum: 'notifyForum', plan: 'notifyPlan' }

export const isAlways = (c: NoteCategory): boolean => ALWAYS.includes(c)

export function isEnabled(c: NoteCategory, s: Pick<Settings, 'notifyMessages' | 'notifySessions' | 'notifyForum' | 'notifyPlan'>): boolean {
  const flag = FLAG[c]
  return flag ? !!s[flag as keyof typeof s] : true
}

export function inQuietHours(ms: number): boolean {
  const h = eat(ms).hour
  return h >= QUIET_START || h < QUIET_END
}

/** The next 7am in East Africa Time after `ms`. */
export function quietEnds(ms: number): number {
  const p = eat(ms)
  const sameDay = fromEat(p.year, p.month, p.day, QUIET_END, 0)
  return p.hour < QUIET_END ? sameDay : sameDay + 24 * 3600_000
}

/** When a note may be shown: straight away, unless quiet hours are on and it isn't a safety or account notice. */
export function deliverAt(c: NoteCategory, at: number, s: Pick<Settings, 'quietHours'>): number {
  if (isAlways(c) || !s.quietHours || !inQuietHours(at)) return at
  return quietEnds(at)
}

/** Whether a new note is over the hourly cap, given the notes already made. */
export function overCap(existing: Pick<AppNote, 'category' | 'at'>[], c: NoteCategory, at: number): boolean {
  if (isAlways(c)) return false
  return existing.filter((n) => !isAlways(n.category) && at - n.at < 3600_000 && at >= n.at).length >= HOURLY_CAP
}

/** What a notification shows on the lock screen, given the member's privacy settings. */
export function lockScreen(n: Pick<AppNote, 'category' | 'title' | 'body'>, s: Pick<Settings, 'hideTextOnLockScreen' | 'neutralNotifications'>): { title: string; body: string } {
  if (s.neutralNotifications) return { title: 'You have a new update', body: 'Open the app to see it.' }
  if (s.hideTextOnLockScreen && n.category === 'message') return { title: n.title, body: 'Open the app to read it.' }
  return { title: n.title, body: n.body }
}

/** Notes that are due, newest first. */
export function due<T extends Pick<AppNote, 'deliverAt' | 'at'>>(notes: T[], t: number): T[] {
  return notes.filter((n) => n.deliverAt <= t).sort((a, b) => b.deliverAt - a.deliverAt || b.at - a.at)
}

export const unreadCount = (notes: Pick<AppNote, 'deliverAt' | 'read' | 'silent'>[], t: number): number => notes.filter((n) => n.deliverAt <= t && !n.read && !n.silent).length

/** Wording that pressures people to come back is not allowed (PRD NTF-2). */
const NUDGES = [/waiting for you/i, /miss(ed)? you/i, /come back/i, /don.t (miss|forget)/i, /you.ve been away/i, /someone (is|wants|has)/i, /\bhurry\b/i, /last chance/i, /only \d+ (left|spots)/i]
export const isNudge = (text: string): boolean => NUDGES.some((re) => re.test(text))
