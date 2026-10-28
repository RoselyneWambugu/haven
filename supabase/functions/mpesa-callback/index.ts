// Safaricom calls this when a member finishes (or abandons) the payment prompt on their phone.
// Nobody signs this call, so it is protected two ways: the address carries a secret token, and a success is
// only believed after Safaricom is asked directly (STK query) and the amount matches the order.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { configured, outcome, stkQuery } from './daraja.ts'

const accepted = () => new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), { headers: { 'Content-Type': 'application/json' } })

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' || !configured()) return new Response('not found', { status: 404 })
  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!same(token, Deno.env.get('MPESA_CALLBACK_TOKEN')!)) return new Response('not found', { status: 404 })

  const body = await req.json().catch(() => null)
  const cb = body?.Body?.stkCallback as { CheckoutRequestID?: string; ResultCode?: number | string; ResultDesc?: string; CallbackMetadata?: { Item?: { Name: string; Value?: unknown }[] } } | undefined
  const id = cb?.CheckoutRequestID
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (!cb || !id) {
    await admin.rpc('payment_event', { p_kind: 'bad_callback', p_reference: null, p_order: null, p_payload: { body } })
    return accepted()
  }

  const found = (await admin.rpc('payment_by_request', { p_checkout_request_id: id })).data as { ok: boolean; order_id?: string; amount?: number; status?: string }
  if (!found?.ok || !found.order_id) {
    await admin.rpc('payment_event', { p_kind: 'unknown_callback', p_reference: id, p_order: null, p_payload: { code: cb.ResultCode, desc: cb.ResultDesc } })
    return accepted()
  }
  const orderId = found.order_id
  if (found.status !== 'pending') return accepted()

  const code = String(cb.ResultCode ?? '')
  if (code !== '0') {
    await admin.rpc('payment_fail', { p_order: orderId, p_reason: outcome(code) })
    await admin.rpc('payment_event', { p_kind: 'payment_failed', p_reference: id, p_order: orderId, p_payload: { code, desc: cb.ResultDesc } })
    return accepted()
  }

  const items = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]))
  const paid = Number(items.Amount)
  const receipt = String(items.MpesaReceiptNumber ?? '')
  if (!receipt || !Number.isFinite(paid) || paid < Math.ceil(Number(found.amount ?? 0))) {
    await admin.rpc('payment_event', { p_kind: 'amount_mismatch', p_reference: id, p_order: orderId, p_payload: { paid, expected: found.amount, receipt } })
    return accepted()
  }
  let verified = false
  try {
    verified = (await stkQuery(id)) === 'paid'
  } catch (_e) {
    verified = false
  }
  if (!verified) {
    // The app's own check will try again; staff can see this in the payment events.
    await admin.rpc('payment_event', { p_kind: 'unverified', p_reference: id, p_order: orderId, p_payload: { receipt } })
    return accepted()
  }
  const c = (await admin.rpc('confirm_payment', { p_order: orderId, p_provider_ref: receipt, p_method: 'mpesa' })).data as { ok: boolean; refund?: boolean }
  if (c?.refund) await admin.rpc('payment_event', { p_kind: 'refund_needed', p_reference: id, p_order: orderId, p_payload: { receipt, why: 'the time was taken while paying' } })
  return accepted()
})
