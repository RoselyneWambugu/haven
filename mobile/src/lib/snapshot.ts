import type { EvidenceLine, ForumPost, Message } from '@/api/types'

/** How much of a conversation a report keeps, and how many of the other person's last messages it flags (PRD SAF-3). */
export const CONTEXT_MESSAGES = 10
export const FLAGGED_MESSAGES = 3
const MAX_TEXT = 500

const clip = (t: string) => (t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT)}…` : t)

/**
 * The reported conversation as it stood when the report was made: the last few messages for context, with the other
 * person's most recent ones marked as the reported content. Later edits, deletions or disappearing messages cannot change it.
 */
export function chatSnapshot(messages: Message[]): EvidenceLine[] {
  const spoken = messages.filter((m) => m.from !== 'system').slice(-CONTEXT_MESSAGES)
  const flagged = new Set(
    spoken
      .filter((m) => m.from === 'them')
      .slice(-FLAGGED_MESSAGES)
      .map((m) => m.id),
  )
  return spoken.map((m, i) => ({ id: `e${i}`, who: m.from === 'me' ? 'reporter' : 'reported', text: clip(m.text), reported: flagged.has(m.id) }))
}

/** A reported post is kept whole: its title and body. */
export function postSnapshot(post: Pick<ForumPost, 'title' | 'body'>): EvidenceLine[] {
  return [{ id: 'e0', who: 'reported', text: clip(`${post.title}\n${post.body}`), reported: true }]
}

/** A reported comment is kept with the post it answers and the comment just before it, so it can be read in context. */
export function commentSnapshot(post: Pick<ForumPost, 'title' | 'comments'>, commentId: string): EvidenceLine[] {
  const i = post.comments.findIndex((c) => c.id === commentId)
  if (i < 0) return []
  const before = i > 0 ? [post.comments[i - 1]] : []
  return [
    { id: 'e0', who: 'reporter', text: clip(`Post: ${post.title}`) },
    ...before.map((c, k) => ({ id: `e${k + 1}`, who: 'reporter' as const, text: clip(c.text) })),
    { id: `e${before.length + 1}`, who: 'reported' as const, text: clip(post.comments[i].text), reported: true },
  ]
}

/** Earlier reports against the same person, so a reviewer sees a pattern (SAF-3 prior history). */
export function priorReports(reports: { targetId: string; at: number }[], targetId: string, before: number): number {
  return reports.filter((r) => r.targetId === targetId && r.at < before).length
}
