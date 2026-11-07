// Gives a member or a therapist the address to open for a voice or video session. The app calls this with the person's sign-in.
// The database decides whether they may join (their own session, a call, open from 10 minutes before the start until the end) and records that they joined.
// If calls aren't set up (no Daily secrets) it answers code "unavailable" and the app says so.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { dailyConfigured, openRoom, type CallCtx } from './daily.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ ok: false, code: 'method' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const header = req.headers.get('Authorization') ?? ''
  const user = await createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: header } } }).auth.getUser()
  const uid = user.data.user?.id
  if (!uid) return reply({ ok: false, code: 'auth', error: 'Sign in first.' }, 401)

  const { session_id } = (await req.json().catch(() => ({}))) as { session_id?: string }
  if (!session_id) return reply({ ok: false, code: 'session', error: 'No session.' })
  if (!dailyConfigured()) return reply({ ok: false, code: 'unavailable', error: 'Calls aren’t switched on yet.' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ctx = (await admin.rpc('call_context', { p_session: session_id, p_account: uid })).data as ({ ok: boolean; code?: string; error?: string } & Partial<CallCtx>) | null
  if (!ctx?.ok) return reply({ ok: false, code: ctx?.code ?? 'gone', error: ctx?.error ?? 'That session can’t be joined.' })

  const room = await openRoom(ctx as CallCtx, uid)
  if (!room.ok) return reply({ ok: false, code: 'provider', error: 'We couldn’t start the call. Try again in a moment.' })
  return reply({ ok: true, url: room.url, mode: ctx.mode })
})
