// Works through the queued refunds. Called every minute by the database (pg_cron + pg_net), and right after a refund is made, with the secret
// token in x-drain-token (the SMS_DRAIN_TOKEN secret). Each refund goes back to the number that paid, through Safaricom B2C. Safaricom answers
// later on mpesa-refund-result. Until the B2C secrets are set this does nothing, and billing staff send refunds by hand.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { msisdn, refundConfigured, sendRefund } from './daraja.ts'

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const want = Deno.env.get('SMS_DRAIN_TOKEN')
  if (req.method !== 'POST' || !want || !same(req.headers.get('x-drain-token') ?? '', want)) return new Response('not found', { status: 404 })
  if (!refundConfigured()) return reply({ ok: false, sent: 0, reason: 'not configured' })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const claimed = (await admin.rpc('refund_claim', { p_limit: 10 })).data as { refunds?: { id: number; amount: number; phone: string | null }[] }
  const resultUrl = `${url}/functions/v1/mpesa-refund-result?token=${encodeURIComponent(Deno.env.get('MPESA_CALLBACK_TOKEN')!)}`
  let started = 0
  for (const r of claimed?.refunds ?? []) {
    const phone = msisdn(r.phone ?? '')
    const amount = Math.floor(Number(r.amount))
    if (!phone || !(amount >= 1)) {
      await admin.rpc('refund_failed', { p_id: r.id, p_error: 'No valid M-Pesa number or amount on record.', p_retry: false })
      continue
    }
    const s = await sendRefund({ phone, amount, reference: `R-${r.id}`, resultUrl })
    if (s.ok) {
      await admin.rpc('refund_started', { p_id: r.id, p_conversation: s.conversationId })
      started += 1
    } else {
      await admin.rpc('refund_failed', { p_id: r.id, p_error: s.error, p_retry: s.retry })
    }
  }
  return reply({ ok: true, started })
})
