import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { decideFee, loadEarnings, loadFee, loadStaffPayouts, markPayoutPaid, proposeFee, requestPayout, setMinPayout } from '../src/backend/remoteFees'
import { split } from '../src/lib/portal'

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: name in replies ? replies[name] : { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}
afterEach(() => setClient(null))

describe('what a session earns', () => {
  it('uses the fee fixed on the session, and the demo rate when there is none', () => {
    expect(split(1000, 200)).toEqual({ gross: 1000, fee: 200, net: 800 })
    expect(split(1000)).toEqual({ gross: 1000, fee: 150, net: 850 })
    expect(split(1000, 0)).toEqual({ gross: 1000, fee: 0, net: 1000 })
    expect(split(null, 100)).toEqual({ gross: null, fee: null, net: null })
  })
})

describe('the therapist', () => {
  it('reads earnings and withdraws', async () => {
    const calls = fake({ portal_earnings: { ok: true, feePct: 15, availableNet: 850, availableSessions: 1, pendingNet: 0, payouts: [] }, portal_request_payout: { ok: true, id: 'P-1', netKes: 850 } })
    expect((await loadEarnings())?.availableNet).toBe(850)
    const r = await requestPayout()
    expect(r.ok && r.value.netKes).toBe(850)
    expect(calls.map((c) => c.name)).toEqual(['portal_earnings', 'portal_request_payout'])
  })

  it('shows the server’s reason when there is nothing to withdraw', async () => {
    fake({ portal_request_payout: { ok: false, code: 'nothing', error: 'There is nothing available to withdraw yet.' } })
    const r = await requestPayout()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('nothing')
  })

  it('has no earnings to show when offline', async () => {
    fake({ portal_earnings: null })
    expect(await loadEarnings()).toBeNull()
  })
})

describe('staff', () => {
  it('reads the fee and a change waiting, proposes, and decides', async () => {
    const calls = fake({ admin_fee: { ok: true, pct: 15, pending: { id: 'c1', pct: 20, requestedBy: 'A. Admin', mine: false } }, admin_propose_fee: { ok: true, proposed: true } })
    expect(await loadFee()).toEqual({ pct: 15, minPayoutKes: 0, pending: { id: 'c1', pct: 20, requestedBy: 'A. Admin', mine: false } })
    const p = await proposeFee(20)
    expect(p.ok && p.value.applied).toBe(false)
    await decideFee('c1', true)
    expect(calls.find((c) => c.name === 'admin_decide_fee')?.args).toEqual({ p_id: 'c1', p_approve: true })
  })

  it('lists payouts and marks one paid with a reference', async () => {
    const calls = fake({ admin_payouts: { ok: true, payouts: [{ id: 'P-1', therapist: 'Dr. A', netKes: 850, status: 'requested' }] } })
    expect(await loadStaffPayouts()).toHaveLength(1)
    await markPayoutPaid('P-1', 'MPESA123')
    expect(calls.find((c) => c.name === 'admin_mark_payout_paid')?.args).toEqual({ p_id: 'P-1', p_reference: 'MPESA123' })
  })

  it('shows the server’s refusal', async () => {
    fake({ admin_mark_payout_paid: { ok: false, code: 'reference', error: 'Add the M-Pesa or bank reference for the payment.' } })
    const r = await markPayoutPaid('P-1', 'x')
    expect(r.ok).toBe(false)
  })
})

describe('claw-back and the smallest withdrawal', () => {
  it('reads what is owed back and the minimum, and saves a new minimum', async () => {
    const calls = fake({ portal_earnings: { ok: true, feePct: 15, minPayoutKes: 500, owedBackKes: 850, availableNet: 0, availableSessions: 0, pendingNet: 0, payouts: [] } })
    const e = await loadEarnings()
    expect(e?.owedBackKes).toBe(850)
    expect(e?.minPayoutKes).toBe(500)
    await setMinPayout(1000)
    expect(calls.find((c) => c.name === 'admin_set_min_payout')?.args).toEqual({ p_kes: 1000 })
  })

  it('shows the minimum in the fee state', async () => {
    fake({ admin_fee: { ok: true, pct: 15, minPayoutKes: 500, pending: null } })
    expect((await loadFee())?.minPayoutKes).toBe(500)
  })

  it('shows the server’s reason when a withdrawal is below the minimum', async () => {
    fake({ portal_request_payout: { ok: false, code: 'minimum', error: 'The smallest withdrawal is KES 1000. You have KES 850 available.' } })
    const r = await requestPayout()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('minimum')
  })
})
