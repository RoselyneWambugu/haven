// Says whether voice and video calls are set up, without showing any secret: are DAILY_API_KEY and DAILY_DOMAIN present, and does Daily accept the key.
// Open to anyone, because it only answers yes or no and the room host name. Use it after adding the secrets, or when a call screen says calls aren't switched on.
declare const Deno: { env: { get(key: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void }

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

Deno.serve(async () => {
  const key = Deno.env.get('DAILY_API_KEY')
  const domain = Deno.env.get('DAILY_DOMAIN')
  const out: Record<string, unknown> = { hasKey: !!key, hasDomain: !!domain }
  if (domain) {
    const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    out.host = d.includes('.') ? d : `${d}.daily.co`
  }
  if (key) {
    try {
      const r = await fetch('https://api.daily.co/v1/rooms?limit=1', { headers: { Authorization: `Bearer ${key}` } })
      out.dailyAnswered = r.status
      out.keyAccepted = r.ok
    } catch {
      out.keyAccepted = false
      out.dailyAnswered = 'unreachable'
    }
  }
  out.ready = !!key && !!domain && out.keyAccepted === true
  return json(out)
})
