import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'

export type CallResult = { ok: true; url: string } | { ok: false; code: string; error: string }

/**
 * Asks the server for the address to open for a voice or video session. The server checks that this person is the member or the therapist,
 * that the session is a call and open (from 10 minutes before the start until the end), records that they joined, and answers with a private
 * Daily room address that only works for them. `unavailable` means calls aren't set up yet.
 */
export async function joinCall(sessionId: string): Promise<CallResult> {
  try {
    const r = await supabase().functions.invoke('call-join', { body: { session_id: sessionId } })
    const d = r.data as { ok?: boolean; url?: string; code?: string; error?: string } | null
    if (r.error || !d) return { ok: false, code: 'network', error: OFFLINE }
    if (d.ok && d.url) return { ok: true, url: d.url }
    return { ok: false, code: d.code ?? 'gone', error: d.error ?? 'That session can’t be joined.' }
  } catch {
    return { ok: false, code: 'network', error: OFFLINE }
  }
}
