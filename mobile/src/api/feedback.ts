import { now } from '@/lib/clock'
import { FACES, validateFeedback } from '@/lib/feedback'
import { uid } from '@/lib/id'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import type { FeedbackKind, Res } from './types'

/** Private feedback from members: the "felt heard" rating (FDB-1) and Settings feedback (FDB-3). */
export const feedback = {
  /** Stores the answer on the conversation only. The other person never sees it. */
  rateHeard(conversationId: string, score: number, comment: string): Res {
    if (!FACES.some((f) => f.score === score)) return { ok: false, error: 'Pick one of the faces.' }
    const c = getDb().conversations.find((x) => x.id === conversationId)
    if (!c) return { ok: false, error: 'That conversation is gone.' }
    update((s) => ({
      conversations: s.conversations.map((x) => (x.id === conversationId ? { ...x, heard: { score, comment: comment.trim().slice(0, 500) } } : x)),
    }))
    showToast('Thank you. Your answer is private.')
    return { ok: true, value: undefined }
  },

  skipHeard(conversationId: string): void {
    update((s) => ({ conversations: s.conversations.map((x) => (x.id === conversationId ? { ...x, heard: 'skipped' as const } : x)) }))
  },

  send(kind: FeedbackKind, text: string, withDevice: boolean): Res {
    const err = validateFeedback(text)
    if (err) return { ok: false, error: err }
    update((s) => ({ feedback: [...s.feedback, { id: uid('fb'), kind, text: text.trim(), at: now(), withDevice }] }))
    showToast('Thank you. We read every note.')
    return { ok: true, value: undefined }
  },
}
