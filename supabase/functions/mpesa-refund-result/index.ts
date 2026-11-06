// Safaricom calls this when a refund sent by mpesa-refund has been paid out, or has failed. Nobody signs the call, so the address carries a
// secret token (the same MPESA_CALLBACK_TOKEN as for payments) and the refund is found by the conversation id we stored when we sent it.
import { createClient } from 'npm:@supabase/supabase-js@2'

const accepted = () => new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), { headers: { 'Content-Type': 'application/json' } })

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  const want = Deno.env.get('MPESA_CALLBACK_TOKEN')
  if (req.method !== 'POST' || !want || !same(new URL(req.url).searchParams.get('token') ?? '', want)) return new Response('not found', { status: 404 })
  const body = await req.json().catch(() => null)
  const r = body?.Result as { ResultCode?: number | string; ResultDesc?: string; OriginatorConversationID?: string; TransactionID?: string } | undefined
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!r?.OriginatorConversationID) {
    await admin.rpc('payment_event', { p_kind: 'bad_refund_result', p_reference: null, p_order: null, p_payload: { body } })
    return accepted()
  }
  const ok = String(r.ResultCode) === '0'
  await admin.rpc('refund_result', { p_conversation: r.OriginatorConversationID, p_ok: ok, p_receipt: r.TransactionID ?? '', p_error: ok ? null : String(r.ResultDesc ?? 'Safaricom did not complete it.') })
  return accepted()
})
