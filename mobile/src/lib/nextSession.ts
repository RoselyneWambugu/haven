import type { Session } from '@/api/types'

/** The member's next booked session that has not ended, and how many booked sessions are still to come. */
export function nextSession<T extends Pick<Session, 'status' | 'start' | 'end'>>(sessions: T[], now: number): { next: T | null; upcoming: number } {
  const coming = sessions.filter((s) => s.status === 'booked' && s.end > now).sort((a, b) => a.start - b.start)
  return { next: coming[0] ?? null, upcoming: coming.length }
}
