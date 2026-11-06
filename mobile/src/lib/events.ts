import type { CommunityEvent, EventKind, EventMode } from '@/api/types'

const MIN = 60_000

export const EVENT_KINDS: { key: EventKind; label: string }[] = [
  { key: 'webinar', label: 'Webinar' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'talk', label: 'Talk' },
  { key: 'walk', label: 'Group walk' },
  { key: 'meetup', label: 'Meetup' },
]
export const kindLabel = (k: EventKind): string => EVENT_KINDS.find((x) => x.key === k)?.label ?? 'Event'

export const EVENT_LIMITS = { minTitle: 8, maxTitle: 80, minBlurb: 20, maxBlurb: 400, minDuration: 30, maxDuration: 240, minLeadMinutes: 60 }

export interface NewEventInput {
  title: string
  blurb: string
  kind: EventKind
  mode: EventMode
  place: string
  startsAt: number
  durationMin: number
  host: string
}

/** Checks a new event before it is scheduled. Returns a plain reason, or null when it is fine. */
export function validateNewEvent(i: NewEventInput, now: number): string | null {
  const title = i.title.trim()
  if (title.length < EVENT_LIMITS.minTitle) return `Give it a title of at least ${EVENT_LIMITS.minTitle} characters.`
  if (title.length > EVENT_LIMITS.maxTitle) return `Keep the title under ${EVENT_LIMITS.maxTitle} characters.`
  const blurb = i.blurb.trim()
  if (blurb.length < EVENT_LIMITS.minBlurb) return `Say what it is about in at least ${EVENT_LIMITS.minBlurb} characters.`
  if (blurb.length > EVENT_LIMITS.maxBlurb) return `Keep the description under ${EVENT_LIMITS.maxBlurb} characters.`
  if (i.place.trim().length < 3) return i.mode === 'in-person' ? 'Name the public place it happens.' : 'Add a short note on how people join.'
  if (i.place.trim().length > 120) return 'Keep the place or note under 120 characters.'
  if (i.host.trim().length < 2) return 'Say who is running it.'
  if (i.durationMin < EVENT_LIMITS.minDuration || i.durationMin > EVENT_LIMITS.maxDuration) return `An event runs ${EVENT_LIMITS.minDuration} to ${EVENT_LIMITS.maxDuration} minutes.`
  if (i.startsAt < now + EVENT_LIMITS.minLeadMinutes * MIN) return 'Schedule it at least an hour ahead, so people can see it.'
  return null
}

export const PROPOSAL_LEAD_DAYS = 3
export const MAX_PENDING_PROPOSALS = 3
export const isLive = (e: Pick<CommunityEvent, 'status'>): boolean => !e.status || e.status === 'live'

/** A therapist's proposal is checked like a staff event, but needs more notice so a reviewer has time to decide. The therapist runs it themselves. */
export function validateProposal(i: Omit<NewEventInput, 'host'>, therapistName: string, now: number): string | null {
  const err = validateNewEvent({ ...i, host: therapistName }, now)
  if (err) return err
  if (i.startsAt < now + PROPOSAL_LEAD_DAYS * 24 * 60 * MIN) return `Propose it at least ${PROPOSAL_LEAD_DAYS} days ahead, so it can be reviewed.`
  return null
}

export const eventEnd = (e: Pick<CommunityEvent, 'startsAt' | 'durationMin'>): number => e.startsAt + e.durationMin * MIN
export const isOver = (e: Pick<CommunityEvent, 'startsAt' | 'durationMin'>, now: number): boolean => eventEnd(e) <= now
export const isHappeningNow = (e: Pick<CommunityEvent, 'startsAt' | 'durationMin' | 'cancelled'>, now: number): boolean => !e.cancelled && e.startsAt <= now && now < eventEnd(e)

/** What a member sees: events that have not finished and are not cancelled, soonest first. */
export function upcomingEvents(events: CommunityEvent[], now: number): CommunityEvent[] {
  return events.filter((e) => isLive(e) && !e.cancelled && !isOver(e, now)).sort((a, b) => a.startsAt - b.startsAt)
}
