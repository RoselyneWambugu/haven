// Starts an M-Pesa payment for a member's pending order, and checks on it. The app calls this with the member's sign-in.
// If M-Pesa isn't set up (no secrets), it answers code "unavailable" and the app falls back to the test-number payment.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { configured, msisdn, stkPush, stkQuery } from './daraja.ts'

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
  if (!configured()) return reply({ ok: false, code: 'unavailable', error: 'Payments aren’t switched on yet.' })

  const { order_id, action } = (await req.json().catch(() => ({}))) as { order_id?: string; action?: string }
  if (!order_id) return reply({ ok: false, code: 'order', error: 'No order.' })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ctx = (await admin.rpc('payment_context', { p_order: order_id, p_account: uid })).data as { ok: boolean; status?: string; amount?: number; kind?: string; phone?: string; checkout_request_id?: string | null; error?: string; code?: string }
  if (!ctx?.ok) return reply({ ok: false, code: ctx?.code ?? 'gone', error: ctx?.error ?? 'That checkout is no longer open.' })

  try {
    if (action === 'check') {
      if (ctx.status === 'paid') return reply({ ok: true, state: 'paid' })
      if (ctx.status !== 'pending' || !ctx.checkout_request_id) return reply({ ok: true, state: ctx.status })
      const o = await stkQuery(ctx.checkout_request_id)
      if (o === 'pending') return reply({ ok: true, state: 'pending' })
      if (o !== 'paid') {
        await admin.rpc('payment_fail', { p_order: order_id, p_reason: o })
        return reply({ ok: true, state: 'failed', failure: o })
      }
      const c = (await admin.rpc('confirm_payment', { p_order: order_id, p_provider_ref: `mpesa:${ctx.checkout_request_id}`, p_method: 'mpesa' })).data as { ok: boolean; refund?: boolean }
      if (c?.refund) await admin.rpc('payment_event', { p_kind: 'refund_needed', p_reference: ctx.checkout_request_id, p_order: order_id, p_payload: { why: 'the time was taken while paying' } })
      return reply({ ok: true, state: c?.ok ? 'paid' : 'failed', failure: c?.refund ? 'taken' : undefined })
    }

    // start
    if (ctx.status !== 'pending') return reply({ ok: false, code: 'gone', error: 'That checkout is no longer open.' })
    if (ctx.checkout_request_id) return reply({ ok: true, state: 'pending' })
    const amount = Math.ceil(Number(ctx.amount ?? 0))
    if (!(amount >= 1)) return reply({ ok: false, code: 'amount', error: 'This checkout has no price yet.' })
    const phone = msisdn(ctx.phone ?? '')
    if (!phone) return reply({ ok: false, code: 'phone', error: 'We need a Kenyan M-Pesa number on your account.' })
    const callbackUrl = `${url}/functions/v1/mpesa-callback?token=${encodeURIComponent(Deno.env.get('MPESA_CALLBACK_TOKEN')!)}`
    const p = await stkPush({ phone, amount, reference: `EC${order_id.slice(0, 8)}`, description: ctx.kind === 'session' ? 'Echo session' : 'Echo plan', callbackUrl })
    if (!p.ok) return reply({ ok: false, code: 'push', error: 'We couldn’t reach M-Pesa. Try again in a moment.' })
    await admin.rpc('payment_attach_request', { p_order: order_id, p_checkout_request_id: p.id })
    return reply({ ok: true, state: 'pending' })
  } catch (_e) {
    return reply({ ok: false, code: 'push', error: 'We couldn’t reach M-Pesa. Try again in a moment.' })
  }
})
