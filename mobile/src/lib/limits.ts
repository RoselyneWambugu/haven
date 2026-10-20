import type { Conversation, Session } from '@/api/types'
import { isExpired } from './chatLife'

/** A member can have this many peer chats open at once. A new match waits until one ends or expires. */
export const MAX_PEER_CHATS = 5

export const openPeerChats = (convs: Conversation[], sessions: Pick<Session, 'therapistId' | 'end' | 'status'>[], t: number): number =>
  convs.filter((c) => c.kind === 'peer' && !c.ended && !isExpired(c, sessions, t)).length

/**
 * The therapist a member is working with now: one with a booked session still to come, or a chat that has not ended.
 * Only one at a time (PRD THR). Null when the member is free to choose anyone.
 */
export function currentTherapist(convs: Conversation[], sessions: Pick<Session, 'therapistId' | 'start' | 'end' | 'status'>[], t: number): string | null {
  const booked = sessions.find((s) => s.status === 'booked' && s.end > t)
  if (booked) return booked.therapistId
  const chat = convs.find((c) => c.kind === 'therapist' && !c.ended && c.therapistId && !isExpired(c, sessions, t))
  return chat?.therapistId ?? null
}

/** Whether the member may book this therapist now. */
export function canBookTherapist(convs: Conversation[], sessions: Pick<Session, 'therapistId' | 'start' | 'end' | 'status'>[], therapistId: string, t: number): boolean {
  const cur = currentTherapist(convs, sessions, t)
  return cur === null || cur === therapistId
}
