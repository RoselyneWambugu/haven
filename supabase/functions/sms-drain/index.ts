// Works through the queued reminder texts. Called every five minutes by the database (pg_cron + pg_net) with the secret
// token in x-drain-token. The token is the SMS_DRAIN_TOKEN edge function secret, and the same value is stored in the
// database vault under the name sms_drain_token.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendSms, smsConfigured } from './africastalking.ts'

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  const want = Deno.env.get('SMS_DRAIN_TOKEN')
  if (req.method !== 'POST' || !want || !same(req.headers.get('x-drain-token') ?? '', want)) return new Response('not found', { status: 404 })
  if (!smsConfigured()) return new Response(JSON.stringify({ ok: false, sent: 0, reason: 'not configured' }), { headers: { 'Content-Type': 'application/json' } })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const claimed = (await admin.rpc('sms_claim', { p_limit: 30 })).data as { messages?: { id: number; phone: string; body: string }[] }
  let sent = 0
  for (const m of claimed?.messages ?? []) {
    const r = await sendSms(m.phone, m.body)
    await admin.rpc('sms_result', { p_id: m.id, p_ok: r.ok, p_error: r.error ?? null })
    if (r.ok) sent += 1
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { 'Content-Type': 'application/json' } })
})
