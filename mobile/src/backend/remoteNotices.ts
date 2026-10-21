import type { Notice, Res } from '@/api/types'
import { getDb, updateAccount } from '@/store/db'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'

interface RemoteNotice {
  id: string
  kind: Notice['kind']
  rule: string
  explanation: string
  at: number
  expires_at: number | null
  appeal: Notice['appeal']
  appeal_text: string | null
}

/** Brings the member's notices and account standing in line with the server, where staff decisions are recorded. */
export async function syncNotices(): Promise<void> {
  if (!getDb().account) return
  const { data, error } = await supabase().rpc('my_notices')
  const d = data as { ok?: boolean; notices?: RemoteNotice[] } | null
  if (error || !d?.ok || !d.notices) return
  const acct = await supabase().rpc('my_account')
  const standing = (acct.data as { standing?: 'good' | 'restricted' | 'paused' } | null)?.standing
  const notices = d.notices.map((n): Notice => ({ id: n.id, kind: n.kind, rule: n.rule, explanation: n.explanation, at: n.at, expiresAt: n.expires_at, appeal: n.appeal, appealText: n.appeal_text ?? undefined }))
  updateAccount((a) => ({ ...a, notices, standing: standing ?? a.standing }))
}

/** A member appeals a notice. The server records it for a reviewer who did not make the original decision. */
export async function appealNotice(noticeId: string, text: string): Promise<Res> {
  const t = text.trim()
  if (t.length < 10) return { ok: false, error: 'Tell us what happened in a sentence or two.' }
  const { data, error } = await supabase().rpc('appeal_notice', { p_notice: noticeId, p_text: t })
  if (error || !data) return { ok: false, error: OFFLINE }
  const r = data as { ok: boolean; error?: string; code?: string }
  if (!r.ok) return { ok: false, error: r.error ?? OFFLINE, code: r.code }
  await syncNotices()
  return { ok: true, value: undefined }
}
