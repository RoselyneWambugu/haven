import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { loadPaymentEvents, loadSmsQueue, resolvePaymentEvent, retrySms } from '../src/backend/remotePaymentOps'

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({ rpc: async (name: string, args?: Record<string, unknown>) => (calls.push({ name, args }), { data: name in replies ? replies[name] : { ok: true }, error: null }) } as unknown as SupabaseClient)
  return calls
}
afterEach(() => setClient(null))

describe('payments to reconcile', () => {
  it('lists events, or null when offline or not allowed', async () => {
    fake({ admin_payment_events: { ok: true, events: [{ id: 1, kind: 'refund_needed', reference: 'ws_1', at: 1, resolved: false, detail: 'x' }] } })
    expect(await loadPaymentEvents()).toHaveLength(1)
    fake({ admin_payment_events: { ok: false, code: 'role' } })
    expect(await loadPaymentEvents()).toBeNull()
  })

  it('resolves with a note and shows the server’s refusal', async () => {
    const calls = fake()
    expect((await resolvePaymentEvent(3, 'Refunded, ref QHX1')).ok).toBe(true)
    expect(calls[0].args).toEqual({ p_id: 3, p_note: 'Refunded, ref QHX1' })
    fake({ admin_resolve_payment_event: { ok: false, code: 'note', error: 'Say what you did, for example the refund reference.' } })
    expect((await resolvePaymentEvent(3, 'x')).ok).toBe(false)
  })
})

describe('the text queue', () => {
  it('reads the counts and retries a failed text', async () => {
    const calls = fake({ admin_sms_queue: { ok: true, queued: 2, sent24h: 10, failed: 1, oldestQueuedMinutes: 4, failures: [{ id: 9, kind: 'session', phoneTail: '283', error: 'network', at: 1 }] } })
    const q = await loadSmsQueue()
    expect(q?.failures[0].phoneTail).toBe('283')
    await retrySms(9)
    expect(calls.find((c) => c.name === 'admin_retry_sms')?.args).toEqual({ p_id: 9 })
  })
})
