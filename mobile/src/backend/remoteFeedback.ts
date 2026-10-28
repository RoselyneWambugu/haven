import { feedback as mockFeedback } from '@/api/feedback'
import type { FeedbackItem, FeedbackKind, Res } from '@/api/types'
import { FACES, validateFeedback, type HeardSummary } from '@/lib/feedback'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

/** Staff: the notes and the felt-heard shares, worked out on the server where small groups are hidden. */
export async function syncFeedback(): Promise<void> {
  const d = await call<Reply & { notes?: FeedbackItem[]; heard?: HeardSummary }>('admin_feedback')
  if (!d.ok || !d.notes) return
  update((s) => ({ feedback: d.notes!, admin: s.admin ? { ...s.admin, heardSummary: d.heard } : s.admin }))
}

export const remoteFeedback = {
  ...mockFeedback,

  /** The answer is kept after the chat is deleted. The other person never sees it. */
  async rateHeard(conversationId: string, score: number, comment: string): Promise<Res> {
    if (!FACES.some((f) => f.score === score)) return { ok: false, error: 'Pick one of the faces.' }
    const r = await call('rate_heard', { p_conversation: conversationId, p_score: score, p_comment: comment.trim().slice(0, 500) })
    if (!r.ok) return res(r)
    update((s) => ({ conversations: s.conversations.map((x) => (x.id === conversationId ? { ...x, heard: { score, comment: comment.trim().slice(0, 500) } } : x)) }))
    showToast('Thank you. Your answer is private.')
    return { ok: true, value: undefined }
  },

  skipHeard(conversationId: string): void {
    update((s) => ({ conversations: s.conversations.map((x) => (x.id === conversationId ? { ...x, heard: 'skipped' as const } : x)) }))
    void call('skip_heard', { p_conversation: conversationId })
  },

  async send(kind: FeedbackKind, text: string, withDevice: boolean): Promise<Res> {
    const err = validateFeedback(text)
    if (err) return { ok: false, error: err }
    const r = await call('send_feedback', { p_kind: kind, p_text: text.trim(), p_with_device: withDevice })
    if (r.ok) showToast('Thank you. We read every note.')
    return res(r)
  },

  async review(id: string): Promise<Res> {
    const r = await call('admin_review_feedback', { p_id: id })
    await syncFeedback()
    return res(r)
  },
}

export const feedbackNotes = (): FeedbackItem[] => getDb().feedback
