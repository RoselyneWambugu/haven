import type { Session, Therapist } from '@/api/types'

/** A therapist's rating is only shown once this many people have rated them (PRD FDB-2). A placeholder until decided. */
export const MIN_REVIEWS = 10

export interface RatingSummary {
  count: number
  /** Null until there are enough reviews to show one. */
  average: number | null
}

/** Stars a member has given a therapist in the sessions on this device. */
export function liveStars(sessions: Pick<Session, 'therapistId' | 'rating' | 'flaked'>[], therapistId: string): number[] {
  return sessions.flatMap((s) => (s.therapistId === therapistId ? (s.flaked ? [FLAKE_STARS] : s.rating ? [s.rating.stars] : []) : []))
}

/** A session the therapist missed counts as this many stars in their average, whatever the member does. */
export const FLAKE_STARS = 1

/** The earlier rating and count, with new ratings folded in. Shown only once there are enough reviews. */
export function summarise(base: Pick<Therapist, 'rating' | 'reviews'>, live: number[] = []): RatingSummary {
  const count = base.reviews + live.length
  if (count < MIN_REVIEWS) return { count, average: null }
  const total = base.rating * base.reviews + live.reduce((a, b) => a + b, 0)
  return { count, average: Math.round((total / count) * 10) / 10 }
}

/** "4.8 (126)", or a plain note while there are too few reviews. */
export function ratingLabel(r: RatingSummary): string {
  if (r.average === null) return r.count ? `${r.count} ${r.count === 1 ? 'review' : 'reviews'} so far` : 'New to Echo'
  return `${r.average.toFixed(1)} (${r.count})`
}
