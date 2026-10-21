import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { loadPayments, remoteBilling, requestRefund, syncPlan, wait } from '../src/backend/remoteBilling'
import { stopPolling } from '../src/backend/remoteChat'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'
import { DEFAULT_SETTINGS } from '../src/api/auth'
import type { Account } from '../src/api/types'

const iso = (d: number) => new Date(Date.now() + d * 86400_000).toISOString()
const SUB = { plan_id: 'monthly', started_at: iso(0), ends_at: iso(30), auto_renew: true, cancelled_at: null, method: 'mpesa', receipt_no: 'EC-123456' }
const PLANS = [{ id: 'daily', days: 1, price_kes: 100, enabled: true }, { id: 'monthly', days: 30, price_kes: 1800, enabled: true }, { id: 'yearly', days: 365, price_kes: 12000, enabled: false }]

interface Script { plan?: unknown; checkout?: unknown; pay?: unknown }

function fake(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'my_plan') return { data: script.plan ?? { ok: true, subscription: null, plans: PLANS }, error: null }
      if (name === 'start_checkout') return { data: script.checkout ?? { ok: true, order_id: 'o-1', amount_kes: 1800, title: 'Monthly peer plan' }, error: null }
      if (name === 'simulate_payment') return { data: script.pay ?? { ok: true, receipt_no: 'EC-123456' }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

const member = { id: 'u1', standing: 'good', settings: DEFAULT_SETTINGS, public: { penName: 'Me' }, blocked: [] } as unknown as Account

beforeEach(() => {
  wait.ms = 0
  resetClock()
  update({ ...freshState(), account: member, signedIn: true } as never)
})
afterEach(() => stopPolling())

describe('syncing the plan', () => {
  it('shows the member’s plan and takes prices and lengths from the server', async () => {
    fake({ plan: { ok: true, subscription: SUB, plans: PLANS } })
    await syncPlan()
    expect(getDb().subscription).toMatchObject({ planId: 'monthly', autoRenew: true, receiptNo: 'EC-123456', method: 'mpesa' })
    const monthly = getDb().content.plans.find((p) => p.id === 'monthly')!
    expect(monthly).toMatchObject({ priceKes: 1800, days: 30, enabled: true })
    expect(monthly.label).toBe('Monthly')
    expect(getDb().content.plans.find((p) => p.id === 'yearly')!.enabled).toBe(false)
  })

  it('shows no plan when the server has none', async () => {
    update({ subscription: SUB as never })
    fake()
    await syncPlan()
    expect(getDb().subscription).toBeNull()
  })
})

describe('checkout and payment', () => {
  it('asks the server to open a checkout and keeps its order id and amount', async () => {
    const calls = fake()
    const r = await remoteBilling.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true })
    expect(r).toEqual({ ok: true, value: { title: 'Monthly peer plan', amountKes: 1800 } })
    expect(calls.find((c) => c.name === 'start_checkout')?.args).toEqual({ p_plan: 'monthly', p_auto_renew: true })
    expect(getDb().checkout).toMatchObject({ id: 'o-1', amountKes: 1800 })
  })

  it('shows the server’s reason when a plan isn’t available', async () => {
    fake({ checkout: { ok: false, code: 'plan', error: 'That plan is not available.' } })
    expect(await remoteBilling.createCheckout({ kind: 'plan', planId: 'yearly', autoRenew: true })).toMatchObject({ ok: false, code: 'plan' })
    expect(getDb().checkout).toBeNull()
  })

  it('a payment that goes through gives the plan and clears the checkout', async () => {
    fake({ plan: { ok: true, subscription: SUB, plans: PLANS } })
    await remoteBilling.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true })
    const r = await remoteBilling.pay('mpesa')
    expect(r).toEqual({ ok: true, receiptNo: 'EC-123456' })
    expect(getDb().checkout).toBeNull()
    expect(getDb().subscription?.planId).toBe('monthly')
  })

  it('reports a timeout, low balance, and payments not being switched on', async () => {
    fake({ pay: { ok: false, code: 'timeout', error: 'x' } })
    await remoteBilling.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true })
    expect(await remoteBilling.pay('mpesa')).toEqual({ ok: false, failure: 'timeout' })
    fake({ pay: { ok: false, code: 'insufficient', error: 'x' } })
    expect(await remoteBilling.pay('mpesa')).toEqual({ ok: false, failure: 'insufficient' })
    fake({ pay: { ok: false, code: 'unavailable', error: 'Payments aren’t switched on yet.' } })
    expect(await remoteBilling.pay('card')).toEqual({ ok: false, failure: 'unavailable' })
    expect(getDb().subscription).toBeNull()
  })

  it('the demo "fail the next payment" switch still works', async () => {
    const calls = fake()
    await remoteBilling.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true })
    update((s) => ({ demo: { ...s.demo, failNextPayment: true } }))
    await remoteBilling.pay('mpesa')
    expect(calls.find((c) => c.name === 'simulate_payment')?.args).toMatchObject({ p_outcome: 'timeout' })
    expect(getDb().demo.failNextPayment).toBe(false)
  })

  it('leaving checkout cancels the order on the server', async () => {
    const calls = fake()
    await remoteBilling.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: true })
    remoteBilling.cancelCheckout()
    expect(getDb().checkout).toBeNull()
    expect(calls.find((c) => c.name === 'cancel_checkout')?.args).toEqual({ p_order: 'o-1' })
  })
})

describe('managing the plan', () => {
  it('cancelling and renewing show at once and tell the server', async () => {
    update({ subscription: { planId: 'monthly', startedAt: 0, endsAt: Date.now() + 1e9, autoRenew: true, cancelledAt: null, method: 'mpesa', receiptNo: 'x' } } as never)
    const calls = fake({ plan: { ok: true, subscription: { ...SUB, auto_renew: false, cancelled_at: iso(0) }, plans: PLANS } })
    remoteBilling.cancelPlan()
    expect(getDb().subscription?.autoRenew).toBe(false)
    expect(calls.some((c) => c.name === 'cancel_plan')).toBe(true)
    remoteBilling.setAutoRenew(true)
    expect(calls.find((c) => c.name === 'set_auto_renew')?.args).toEqual({ p_on: true })
  })
})

describe('payments and refunds', () => {
  it('lists recent payments, or says it could not', async () => {
    const pay = { id: 'o1', title: 'Monthly plan', amountKes: 1500, receiptNo: 'T-1', paidAt: 1, refundable: true, refund: null }
    setClient({ rpc: async () => ({ data: { ok: true, payments: [pay] }, error: null }) } as unknown as SupabaseClient)
    expect(await loadPayments()).toEqual([pay])
    setClient({ rpc: async () => ({ data: null, error: { message: 'offline' } }) } as unknown as SupabaseClient)
    expect(await loadPayments()).toBeNull()
  })

  it('sends the request and shows the server’s refusal', async () => {
    const calls = fake()
    expect((await requestRefund('o1', 'Charged twice by mistake')).ok).toBe(true)
    expect(calls.find((c) => c.name === 'request_refund')?.args).toEqual({ p_order: 'o1', p_reason: 'Charged twice by mistake' })
    setClient({ rpc: async () => ({ data: { ok: false, code: 'late', error: 'Refunds can be asked for within 14 days of paying.' }, error: null }) } as unknown as SupabaseClient)
    const r = await requestRefund('o1', 'Charged twice by mistake')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('late')
  })
})
