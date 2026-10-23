// Africa's Talking SMS. Secrets, set in the Supabase dashboard under Edge Functions > Secrets:
//   AT_USERNAME   your Africa's Talking username ("sandbox" while testing)
//   AT_API_KEY    the API key for that username
//   AT_SENDER_ID  optional: an approved sender name such as ECHO; without it messages come from a shared short code
//   AT_ENV        sandbox (default) or production

export const smsConfigured = (): boolean => !!Deno.env.get('AT_USERNAME') && !!Deno.env.get('AT_API_KEY')

/** +254712345678 from 254712345678, 0712345678 or +254 712 345 678. Null if it isn't a Kenyan mobile number. */
export function e164(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  const n = d.startsWith('254') ? d : d.startsWith('0') ? `254${d.slice(1)}` : `254${d}`
  return /^254[17]\d{8}$/.test(n) ? `+${n}` : null
}

/** Sends one text. Returns whether Africa's Talking accepted it. */
export async function sendSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const number = e164(to)
  if (!number) return { ok: false, error: 'not a Kenyan mobile number' }
  const host = Deno.env.get('AT_ENV') === 'production' ? 'api.africastalking.com' : 'api.sandbox.africastalking.com'
  const form = new URLSearchParams({ username: Deno.env.get('AT_USERNAME')!, to: number, message })
  const from = Deno.env.get('AT_SENDER_ID')
  if (from) form.set('from', from)
  const r = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: Deno.env.get('AT_API_KEY')!, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const j = await r.json().catch(() => ({}))
  const rec = j?.SMSMessageData?.Recipients?.[0]
  // statusCode 100-102 mean processed, sent or queued.
  if (r.ok && rec && Number(rec.statusCode) >= 100 && Number(rec.statusCode) <= 102) return { ok: true }
  return { ok: false, error: String(rec?.status ?? j?.SMSMessageData?.Message ?? `http ${r.status}`).slice(0, 120) }
}
