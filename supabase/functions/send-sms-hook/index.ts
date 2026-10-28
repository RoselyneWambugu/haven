// Supabase Auth "Send SMS" hook: Auth hands us the sign-in code and the phone number, and we send it through Africa's Talking.
// Turn it on in the dashboard: Authentication > Hooks > Send SMS > HTTPS, with this function's address, and copy the generated
// secret into the SEND_SMS_HOOK_SECRET edge function secret (it looks like v1,whsec_...).
// Auth signs every call (Standard Webhooks); anything unsigned or stale is refused.
import { sendSms, smsConfigured } from './africastalking.ts'

const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } })

function b64(s: string): Uint8Array {
  const bin = atob(s)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Standard Webhooks: HMAC-SHA256 of "id.timestamp.body" with the secret, compared with each signature in the header. */
async function verified(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET')
  const id = req.headers.get('webhook-id')
  const ts = req.headers.get('webhook-timestamp')
  const sigs = req.headers.get('webhook-signature')
  if (!secret || !id || !ts || !sigs) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const key = await crypto.subtle.importKey('raw', b64(secret.replace(/^v1,/, '').replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))
  const expected = btoa(String.fromCharCode(...mac))
  return sigs.split(' ').some((s) => {
    const v = s.split(',')[1] ?? ''
    if (v.length !== expected.length) return false
    let d = 0
    for (let i = 0; i < v.length; i++) d |= v.charCodeAt(i) ^ expected.charCodeAt(i)
    return d === 0
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method')
  const body = await req.text()
  if (!(await verified(req, body))) return fail(401, 'Not signed.')
  if (!smsConfigured()) return fail(500, 'SMS isn’t set up.')
  const p = JSON.parse(body) as { user?: { phone?: string }; sms?: { otp?: string } }
  const phone = p.user?.phone
  const otp = p.sms?.otp
  if (!phone || !otp) return fail(400, 'No phone or code.')
  const r = await sendSms(phone, `Your Echo code is ${otp}. Don't share it with anyone.`)
  if (!r.ok) return fail(500, 'We couldn’t send the code.')
  return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
})
