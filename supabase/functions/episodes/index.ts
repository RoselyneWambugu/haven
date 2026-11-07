// Gives a member the addresses to watch Watch episodes. The app calls this with the member's sign-in.
//   {action: "list"}            the published episodes, each with a short-lived picture link
//   {action: "play", id: uuid}  one episode: a short-lived video link (two hours) and its picture
// The files are in a private bucket and are never public. The database checks that the member has an active plan before any link is made.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const HOURS = 3600

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ ok: false, code: 'method' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const header = req.headers.get('Authorization') ?? ''
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: header } } })
  const who = await asUser.auth.getUser()
  if (!who.data.user?.id) return reply({ ok: false, code: 'auth', error: 'Sign in first.' }, 401)

  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const sign = async (path: string | null | undefined, seconds: number): Promise<string | null> => {
    if (!path) return null
    const r = await admin.storage.from('episodes').createSignedUrl(path, seconds)
    return r.data?.signedUrl ?? null
  }

  if (body.action === 'list') {
    const r = (await asUser.rpc('episodes_list')).data as { ok: boolean; code?: string; error?: string; episodes?: { poster_path: string | null }[] } | null
    if (!r?.ok) return reply({ ok: false, code: r?.code ?? 'gone', error: r?.error ?? 'We couldn’t load the episodes.' })
    const episodes = await Promise.all((r.episodes ?? []).map(async ({ poster_path, ...e }) => ({ ...e, poster_url: await sign(poster_path, HOURS) })))
    return reply({ ok: true, episodes })
  }

  if (body.action === 'play' && body.id) {
    const r = (await asUser.rpc('episode_access', { p_id: body.id })).data as { ok: boolean; code?: string; error?: string; title?: string; blurb?: string; video_path?: string; poster_path?: string | null; duration_sec?: number | null } | null
    if (!r?.ok) return reply({ ok: false, code: r?.code ?? 'gone', error: r?.error ?? 'That episode isn’t available.' })
    const video_url = await sign(r.video_path, 2 * HOURS)
    if (!video_url) return reply({ ok: false, code: 'file', error: 'We couldn’t open the video. Try again in a moment.' })
    return reply({ ok: true, title: r.title, blurb: r.blurb, duration_sec: r.duration_sec ?? null, video_url, poster_url: await sign(r.poster_path, 2 * HOURS) })
  }

  return reply({ ok: false, code: 'action', error: 'Nothing to do.' })
})
