import type { Conversation, FeedbackKind } from '@/api/types'

/** Five faces for "Did you feel heard?", from 1 to 5 (PRD SET-7, FDB-1). */
export const FACES: { score: number; label: string }[] = [
  { score: 1, label: 'Not at all' },
  { score: 2, label: 'A little' },
  { score: 3, label: 'Somewhat' },
  { score: 4, label: 'Mostly' },
  { score: 5, label: 'Very much' },
]

/** A conversation counts once each person has written at least once. */
export const MIN_EXCHANGE = 2

export function wasExchange(c: Pick<Conversation, 'messages'>): boolean {
  const mine = c.messages.filter((m) => m.from === 'me').length
  const theirs = c.messages.filter((m) => m.from === 'them').length
  return mine >= 1 && theirs >= 1 && mine + theirs >= MIN_EXCHANGE
}

/** Ask once, only for a peer conversation that has ended after a real exchange. Skipping is final and costs nothing. */
export function shouldAskHeard(c: Pick<Conversation, 'kind' | 'ended' | 'messages' | 'heard'>): boolean {
  return c.kind === 'peer' && c.ended && c.heard === undefined && wasExchange(c)
}

export const FEEDBACK_MAX = 1000
export const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: 'idea', label: 'An idea' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'other', label: 'Something else' },
]

export function validateFeedback(text: string): string | null {
  const t = text.trim()
  if (!t) return 'Write a few words first.'
  if (t.length > FEEDBACK_MAX) return `Please keep it under ${FEEDBACK_MAX} characters.`
  return null
}
