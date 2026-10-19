import { now } from '@/lib/clock'
import { FACES, validateFeedback } from '@/lib/feedback'
import { uid } from '@/lib/id'
import { canAccess } from '@/lib/admin'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { log, me } from './admin'
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

  /** Staff mark a note as read. Needs the Feedback module, and is written to the audit log. */
  review(id: string): Res {
    const a = getDb().admin
    if (!a || !a.signedIn || !canAccess(a.role, 'feedback')) return { ok: false, error: 'Your role can’t open feedback.', code: 'role' }
    const f = getDb().feedback.find((x) => x.id === id)
    if (!f) return { ok: false, error: 'That note is gone.' }
    if (f.reviewedBy) return { ok: true, value: undefined }
    update((s) => ({ feedback: s.feedback.map((x) => (x.id === id ? { ...x, reviewedBy: me().name } : x)) }))
    log('Marked feedback as read', `${f.kind} note`)
    return { ok: true, value: undefined }
  },
}
