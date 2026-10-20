import type { GroupChat, GroupMessage } from '@/api/types'
import { eat, startOfEatDay, clock, dayShort } from './time'
import { CHAT_LIFETIME_MS } from './chatLife'

const MIN = 60_000
const HOUR = 3600_000

/** You can enter the room this long before it starts. */
export const LOBBY_MINUTES = 10
/** A scripted line from the room arrives this often while it is open. */
export const SCRIPT_SPACING_MS = 30_000

export type GroupStatus = 'upcoming' | 'lobby' | 'open' | 'ended'

export const endsAt = (g: Pick<GroupChat, 'startsAt' | 'durationMin'>): number => g.startsAt + g.durationMin * MIN

export function status(g: Pick<GroupChat, 'startsAt' | 'durationMin'>, now: number): GroupStatus {
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
