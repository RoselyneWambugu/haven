import type { Conversation, Session } from '@/api/types'

const H = 3600_000

/** A peer chat lasts 24 hours, then it ends and is deleted, unless it was reported (PRD MSG, privacy). */
export const CHAT_LIFETIME_MS = 24 * H
/** A chat with a therapist lasts a week, then it ends and is deleted, unless it was reported. */
export const THERAPIST_CHAT_LIFETIME_MS = 7 * 24 * H
/** A note is added to a peer chat when this little time is left, and to a therapist chat when a day is left. */
export const WARN_BEFORE_MS = 1 * H
export const THERAPIST_WARN_BEFORE_MS = 24 * H

export const warnBeforeMs = (c: Pick<Conversation, 'kind'>): number => (c.kind === 'therapist' ? THERAPIST_WARN_BEFORE_MS : WARN_BEFORE_MS)
export const lifetimeLabel = (c: Pick<Conversation, 'kind'>): string => (c.kind === 'therapist' ? 'a week' : '24 hours')

type Life = Pick<Conversation, 'kind' | 'createdAt' | 'therapistId'>

/**
 * When a chat is deleted. A peer chat lasts 24 hours from the match. A therapist chat lasts a week from the start, or until 24 hours
 * after the end of the latest booked or finished session with that therapist, whichever is later, so a session never loses its chat.
 */
export function expiresAt(c: Life, sessions: Pick<Session, 'therapistId' | 'end' | 'status'>[] = []): number {
  if (c.kind !== 'therapist') return c.createdAt + CHAT_LIFETIME_MS
  const base = c.createdAt + THERAPIST_CHAT_LIFETIME_MS
  const ends = sessions.filter((s) => s.therapistId === c.therapistId && (s.status === 'booked' || s.status === 'completed')).map((s) => s.end)
  return ends.length ? Math.max(base, Math.max(...ends) + CHAT_LIFETIME_MS) : base
}

export const timeLeft = (c: Life, sessions: Pick<Session, 'therapistId' | 'end' | 'status'>[], t: number): number => expiresAt(c, sessions) - t
export const isExpired = (c: Life, sessions: Pick<Session, 'therapistId' | 'end' | 'status'>[], t: number): boolean => timeLeft(c, sessions, t) <= 0

/** "5 h 12 min", "42 min", or "under a minute". */
export function leftLabel(ms: number): string {
  if (ms <= 0) return 'ending now'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'under a minute'
  const h = Math.floor(m / 60)
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}

export interface SweepResult {
  keep: Conversation[]
  /** Expired but reported: kept for the safety review, out of the member's view. */
  retain: Conversation[]
  /** Expired and not reported: deleted. */
  drop: Conversation[]
}

export function sweep(convs: Conversation[], sessions: Pick<Session, 'therapistId' | 'end' | 'status'>[], reportedIds: Set<string>, t: number): SweepResult {
  const out: SweepResult = { keep: [], retain: [], drop: [] }
  for (const c of convs) {
    if (!isExpired(c, sessions, t)) out.keep.push(c)
    else if (reportedIds.has(c.id)) out.retain.push({ ...c, ended: true })
    else out.drop.push(c)
  }
  return out
}
