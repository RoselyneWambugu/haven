// The parts of the Daraja helper the callback needs (kept in step with ../mpesa-pay/daraja.ts). Secrets, set in the Supabase dashboard under Edge Functions > Secrets:
//   MPESA_ENV              sandbox (default) or production
//   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET   from the Daraja app
//   MPESA_SHORTCODE        the paybill or till number that receives the money
//   MPESA_PASSKEY          the Lipa Na M-Pesa online passkey
//   MPESA_CALLBACK_TOKEN   a long random string; it is part of the callback address so only Safaricom (who is told it) can reach it
//   MPESA_TRANSACTION_TYPE optional: CustomerPayBillOnline (default) or CustomerBuyGoodsOnline
//   MPESA_PARTYB           optional: the till number when the transaction type is CustomerBuyGoodsOnline

const need = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_TOKEN']
export const configured = (): boolean => need.every((k) => !!Deno.env.get(k))

const base = (): string => (Deno.env.get('MPESA_ENV') === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke')

/** Daraja wants the time in East Africa, year to second. */
function stamp(): string {
  const d = new Date(Date.now() + 3 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

async function token(): Promise<string> {
  const basic = btoa(`${Deno.env.get('MPESA_CONSUMER_KEY')}:${Deno.env.get('MPESA_CONSUMER_SECRET')}`)
  const r = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } })
  if (!r.ok) throw new Error(`token ${r.status}`)
  return (await r.json()).access_token as string
}

function auth(): { shortcode: string; timestamp: string; password: string } {
  const shortcode = Deno.env.get('MPESA_SHORTCODE')!
  const timestamp = stamp()
  return { shortcode, timestamp, password: btoa(`${shortcode}${Deno.env.get('MPESA_PASSKEY')}${timestamp}`) }
}

export type Outcome = 'paid' | 'pending' | 'insufficient' | 'cancelled' | 'timeout'

/** Asks Safaricom how a payment request ended. This is what makes a callback believable: we never trust the callback alone. */
export async function stkQuery(checkoutRequestId: string): Promise<Outcome> {
  const a = auth()
  const r = await fetch(`${base()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: a.shortcode, Password: a.password, Timestamp: a.timestamp, CheckoutRequestID: checkoutRequestId }),
  })
  const j = await r.json().catch(() => ({}))
  // While the person is still looking at the prompt Safaricom answers with an error that means "still processing".
  if (j.ResultCode === undefined) return 'pending'
  return outcome(String(j.ResultCode))
}

/** 0 paid; 1 not enough money; 1032 cancelled on the phone; 1037 no answer; anything else is treated as cancelled. */
export function outcome(code: string): Outcome {
  if (code === '0') return 'paid'
  if (code === '1') return 'insufficient'
  if (code === '1037') return 'timeout'
  return 'cancelled'
}
