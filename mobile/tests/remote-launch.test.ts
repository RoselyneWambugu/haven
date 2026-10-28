import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { loadLaunch, signOff } from '../src/backend/remoteLaunch'

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({ rpc: async (name: string, args?: Record<string, unknown>) => (calls.push({ name, args }), { data: name in replies ? replies[name] : { ok: true }, error: null }) } as unknown as SupabaseClient)
  return calls
}
afterEach(() => setClient(null))

describe('the launch checklist', () => {
  it('reads the items and whether everything is ready', async () => {
    fake({ admin_launch: { ok: true, ready: false, items: [{ id: 'admins', group: 'Team', label: 'Two Admins', state: 'todo', detail: '1 active Admin.' }] } })
    const l = await loadLaunch()
    expect(l?.ready).toBe(false)
    expect(l?.items[0].state).toBe('todo')
  })

  it('has nothing to show when offline or not an Admin', async () => {
    fake({ admin_launch: { ok: false, code: 'role', error: 'Only an Admin sees the launch checklist.' } })
    expect(await loadLaunch()).toBeNull()
    fake({ admin_launch: null })
    expect(await loadLaunch()).toBeNull()
  })

  it('confirms an item with a note, and shows the server’s refusal', async () => {
    const calls = fake()
    expect((await signOff('mpesa', true, 'Paid KES 10 and refunded it')).ok).toBe(true)
    expect(calls[0].args).toEqual({ p_item: 'mpesa', p_done: true, p_note: 'Paid KES 10 and refunded it' })
    fake({ admin_launch_signoff: { ok: false, code: 'note', error: 'Say how you checked, in a few words.' } })
    const r = await signOff('mpesa', true, '')
    expect(r.ok).toBe(false)
  })
})
