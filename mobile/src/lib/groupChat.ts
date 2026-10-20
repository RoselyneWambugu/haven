import type { GroupChat, GroupMessage } from '@/api/types'
import { eat, startOfEatDay, clock, dayShort } from './time'
import { CHAT_LIFETIME_MS } from './chatLife'

const MIN = 60_000
const HOUR = 3600_000

/** You can enter the room this long before it starts. */
export const LOBBY_MINUTES = 10
/** A scripted line from the room arrives this often while it is open. */
export const SCRIPT_SPACING_MS = 30_000

export type GroupStatus = 'upcoming' | 'lobby' | 'open' | 'ended' | 'cancelled'

export const endsAt = (g: Pick<GroupChat, 'startsAt' | 'durationMin'>): number => g.startsAt + g.durationMin * MIN

export function status(g: Pick<GroupChat, 'startsAt' | 'durationMin'> & { cancelled?: GroupChat['cancelled'] }, now: number): GroupStatus {
  if (g.cancelled) return 'cancelled'
  if (now >= endsAt(g)) return 'ended'
  if (now >= g.startsAt) return 'open'
  if (now >= g.startsAt - LOBBY_MINUTES * MIN) return 'lobby'
  return 'upcoming'
}

/** A group chat is deleted 24 hours after it ends, unless a message in it was reported. */
export const deletesAt = (g: Pick<GroupChat, 'startsAt' | 'durationMin'>): number => endsAt(g) + CHAT_LIFETIME_MS

export const seatsLeft = (g: Pick<GroupChat, 'capacity' | 'takenOthers' | 'registered'>): number => g.capacity - g.takenOthers - (g.registered ? 1 : 0)

/** Whether a member can sign up: the room has not started, and there is a place. */
export function canRegister(g: Pick<GroupChat, 'startsAt' | 'durationMin' | 'capacity' | 'takenOthers' | 'registered'>, now: number): boolean {
  const s = status(g, now)
  return !g.registered && (s === 'upcoming' || s === 'lobby') && seatsLeft(g) > 0
}

/** "Tomorrow, 14:00 EAT", "Today, 19:00 EAT" or "Fri 23 Oct, 14:00 EAT". */
export function whenLabel(ms: number, now: number): string {
  const day = startOfEatDay(ms)
  const today = startOfEatDay(now)
  const rel = day === today ? 'Today' : day === today + 24 * HOUR ? 'Tomorrow' : dayShort(ms)
  return `${rel}, ${clock(ms)} EAT`
}

export interface ScriptLine {
  name: string
  avatar: GroupMessage['avatar']
  text: string
  facilitator?: boolean
}

/** Lines the room posts, in order. The first is always the facilitator's welcome. */
export function linesDue(script: ScriptLine[], posted: number, g: Pick<GroupChat, 'startsAt' | 'durationMin'>, now: number): { line: ScriptLine; at: number }[] {
  if (now < g.startsAt) return []
  const target = Math.min(script.length, 1 + Math.floor((Math.min(now, endsAt(g)) - g.startsAt) / SCRIPT_SPACING_MS))
  const out: { line: ScriptLine; at: number }[] = []
  for (let i = posted; i < target; i++) out.push({ line: script[i], at: g.startsAt + i * SCRIPT_SPACING_MS })
  return out
}

/** The time of day of an event, for building a schedule. */
export const hourOf = (ms: number): number => eat(ms).hour

export interface NewGroupInput {
  topic: string
  blurb: string
  facilitatorId: string
  startsAt: number
  durationMin: number
  capacity: number
}

export const LIMITS = { minTopic: 8, maxTopic: 90, minBlurb: 20, maxBlurb: 300, minDuration: 30, maxDuration: 90, minCapacity: 4, maxCapacity: 20, minLeadMinutes: 60 }

/** Whether two sessions run at the same time. */
export const overlaps = (a: Pick<GroupChat, 'startsAt' | 'durationMin'>, b: Pick<GroupChat, 'startsAt' | 'durationMin'>): boolean => a.startsAt < endsAt(b) && b.startsAt < endsAt(a)

/** Checks a new group chat before it is scheduled. Returns a plain reason, or null when it is fine. */
export function validateNewGroup(i: NewGroupInput, now: number, others: Pick<GroupChat, 'startsAt' | 'durationMin' | 'facilitatorId' | 'cancelled'>[], facilitatorOk: boolean): string | null {
  const topic = i.topic.trim()
  if (topic.length < LIMITS.minTopic) return `Give it a topic of at least ${LIMITS.minTopic} characters.`
  if (topic.length > LIMITS.maxTopic) return `Keep the topic under ${LIMITS.maxTopic} characters.`
  const blurb = i.blurb.trim()
  if (blurb.length < LIMITS.minBlurb) return `Say what it is about in at least ${LIMITS.minBlurb} characters.`
  if (blurb.length > LIMITS.maxBlurb) return `Keep the description under ${LIMITS.maxBlurb} characters.`
  if (!facilitatorOk) return 'Pick a verified therapist who is not suspended to lead it.'
  if (i.durationMin < LIMITS.minDuration || i.durationMin > LIMITS.maxDuration) return `A group chat runs ${LIMITS.minDuration} to ${LIMITS.maxDuration} minutes.`
  if (i.capacity < LIMITS.minCapacity || i.capacity > LIMITS.maxCapacity) return `A group chat has ${LIMITS.minCapacity} to ${LIMITS.maxCapacity} places.`
  if (i.startsAt < now + LIMITS.minLeadMinutes * MIN) return 'Schedule it at least an hour ahead, so people can sign up.'
  if (others.some((o) => !o.cancelled && o.facilitatorId === i.facilitatorId && overlaps(i, o))) return 'That therapist is already leading a group chat at that time.'
  return null
}

export const isRemoved = (g: Pick<GroupChat, 'removed'>, name: string): boolean => !!g.removed?.some((r) => r.name === name)

/** The people in a room a moderator could remove: everyone who has written, except the leader and Echo, plus the member if signed up. */
export function participants(g: Pick<GroupChat, 'messages' | 'registered' | 'removed'>, memberName: string | undefined): { name: string; removed: boolean; you: boolean }[] {
  const names = new Set<string>()
  for (const m of g.messages) if (!m.facilitator && !m.system && !m.mine) names.add(m.name)
  if (g.registered && memberName) names.add(memberName)
  return [...names].map((name) => ({ name, removed: isRemoved(g, name), you: name === memberName }))
}
