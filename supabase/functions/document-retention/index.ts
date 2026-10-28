// Removes verification documents 12 months after the decision they supported (decision Q-45). Called daily by the database
// (pg_cron + pg_net) with the same secret token the SMS sender uses, in x-drain-token. It deletes the stored files first, then the records.
import { createClient } from 'npm:@supabase/supabase-js@2'

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  const want = Deno.env.get('SMS_DRAIN_TOKEN')
  if (req.method !== 'POST' || !want || !same(req.headers.get('x-drain-token') ?? '', want)) return new Response('not found', { status: 404 })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const found = (await admin.rpc('documents_expired', { p_limit: 100 })).data as { paths?: string[] } | null
  const paths = found?.paths ?? []
  if (paths.length === 0) return new Response(JSON.stringify({ ok: true, removed: 0 }), { headers: { 'Content-Type': 'application/json' } })
  const gone = await admin.storage.from('applications').remove(paths)
  if (gone.error) return new Response(JSON.stringify({ ok: false, error: gone.error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  // Storage reports no error when a file is already gone, so every record in this batch is safe to forget.
  await admin.rpc('documents_forget', { p_paths: paths })
  return new Response(JSON.stringify({ ok: true, removed: paths.length }), { headers: { 'Content-Type': 'application/json' } })
})
