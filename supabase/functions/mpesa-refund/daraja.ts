// Sends money back to a member's phone with Safaricom Daraja B2C (BusinessPayment). Unlike a reversal, B2C can send any amount, which is what
// a part refund needs. Secrets, set in the Supabase dashboard under Edge Functions > Secrets (the first five are the same as for payments):
//   MPESA_ENV, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_CALLBACK_TOKEN
//   MPESA_INITIATOR_NAME        the API operator username Safaricom gave you for B2C
//   MPESA_SECURITY_CREDENTIAL   the operator's password, encrypted with Safaricom's certificate (the Daraja portal can generate it)
//   SMS_DRAIN_TOKEN             the same token the text sender uses; the database sends it in x-drain-token

const need = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_CALLBACK_TOKEN', 'MPESA_INITIATOR_NAME', 'MPESA_SECURITY_CREDENTIAL']
export const refundConfigured = (): boolean => need.every((k) => !!Deno.env.get(k))

const base = (): string => (Deno.env.get('MPESA_ENV') === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke')

async function token(): Promise<string> {
  const basic = btoa(`${Deno.env.get('MPESA_CONSUMER_KEY')}:${Deno.env.get('MPESA_CONSUMER_SECRET')}`)
  const r = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } })
  if (!r.ok) throw new Error(`token ${r.status}`)
  return (await r.json()).access_token as string
}

/** 254712345678 from +254 712 345 678, 0712 345 678 or 712345678. Null if it isn't a Kenyan mobile number. */
export function msisdn(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  const n = d.startsWith('254') ? d : d.startsWith('0') ? `254${d.slice(1)}` : `254${d}`
  return /^254[17]\d{8}$/.test(n) ? n : null
}

/** `retry` is true when asking again could work (Safaricom busy or unreachable), false when the request itself was refused. */
export type SendResult = { ok: true; conversationId: string } | { ok: false; error: string; retry: boolean }

export async function sendRefund(o: { phone: string; amount: number; reference: string; resultUrl: string }): Promise<SendResult> {
  try {
    const originator = crypto.randomUUID()
    const r = await fetch(`${base()}/mpesa/b2c/v1/paymentrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        OriginatorConversationID: originator,
        InitiatorName: Deno.env.get('MPESA_INITIATOR_NAME'),
        SecurityCredential: Deno.env.get('MPESA_SECURITY_CREDENTIAL'),
        CommandID: 'BusinessPayment',
        Amount: o.amount,
        PartyA: Deno.env.get('MPESA_SHORTCODE'),
        PartyB: o.phone,
        Remarks: 'Echo refund',
        QueueTimeOutURL: o.resultUrl,
        ResultURL: o.resultUrl,
        Occasion: o.reference.slice(0, 100),
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok && String(j.ResponseCode) === '0') return { ok: true, conversationId: String(j.OriginatorConversationID ?? originator) }
    return { ok: false, error: String(j.errorMessage ?? j.ResponseDescription ?? `b2c ${r.status}`), retry: r.status >= 500 }
  } catch (e) {
    return { ok: false, error: `unreachable: ${String(e).slice(0, 120)}`, retry: true }
  }
}
