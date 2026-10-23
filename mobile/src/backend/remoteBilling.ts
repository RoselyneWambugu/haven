import { billing as mockBilling } from '@/api/care'
import type { CheckoutItem, PaymentMethod, PaymentResult, PlanId, Res, Subscription } from '@/api/types'
import { now } from '@/lib/clock'
import { getDb, update } from '@/store/db'
import { supabase } from './client'
import { syncDirectory, syncSessions } from './remoteTherapists'
import { syncChats } from './remoteChat'

interface RemoteSub { plan_id: PlanId; started_at: string; ends_at: string; auto_renew: boolean; cancelled_at: string | null; method: 'mpesa' | 'card'; receipt_no: string }
interface RemotePlan { id: PlanId; days: number; price_kes: number | null; enabled: boolean }

type Reply = { ok: true; [k: string]: unknown } | { ok: false; code: string; error: string }
const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
const ms = (iso: string): number => new Date(iso).getTime()
/** How long the screen waits for the prompt on the phone. Tests set it to 0. */
export const wait = { ms: 1500, pollMs: 3000, maxMs: 120_000 }
const pause = (t: number) => new Promise<void>((r) => setTimeout(r, t))

async function rpc(name: string, args?: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) return { ok: false, code: 'network', error: OFFLINE }
  return (data ?? { ok: true }) as Reply
}

const toSubscription = (s: RemoteSub): Subscription => ({
  planId: s.plan_id, startedAt: ms(s.started_at), endsAt: ms(s.ends_at), autoRenew: s.auto_renew, cancelledAt: s.cancelled_at ? ms(s.cancelled_at) : null, method: s.method, receiptNo: s.receipt_no,
})

type Pushed = { ok?: boolean; code?: string; state?: string; failure?: string }

/** Asks the server to send the M-Pesa prompt and waits for the result. Null when M-Pesa isn't set up, so the caller can use the test payment. */
async function payWithMpesa(orderId: string): Promise<PaymentResult | null> {
  const invoke = async (action: 'start' | 'check'): Promise<{ data: Pushed | null; error: unknown }> => {
    try {
      const r = await supabase().functions.invoke('mpesa-pay', { body: { order_id: orderId, action } })
      return { data: r.data as Pushed | null, error: r.error }
    } catch {
      return { data: null, error: true }
    }
  }
  const started = await invoke('start')
  const s = started.data
  if (started.error || !s) return null
  if (s.code === 'unavailable') return null
  if (!s.ok) return { ok: false, failure: 'unavailable' }
  const deadline = Date.now() + wait.maxMs
  let polls = 0
  while (Date.now() < deadline) {
    await pause(wait.pollMs)
    polls += 1
    // The callback from Safaricom usually settles it. Every few checks, ask Safaricom directly in case the callback never came.
    if (polls % 4 === 0) {
      const c = (await invoke('check')).data
      if (c?.state === 'failed') return { ok: false, failure: c.failure === 'taken' ? 'taken' : c.failure === 'insufficient' ? 'insufficient' : c.failure === 'cancelled' ? 'cancelled' : 'timeout' }
    }
    const r = await rpc('order_status', { p_order: orderId })
    if (!r.ok) continue
    if (r.status === 'paid') return { ok: true, receiptNo: String(r.receipt_no ?? ''), sessionId: r.session_id ? String(r.session_id) : undefined }
    if (r.status === 'failed' || r.status === 'cancelled') {
      const f = String(r.failure ?? '')
      return { ok: false, failure: f === 'insufficient' ? 'insufficient' : f === 'cancelled' ? 'cancelled' : 'timeout' }
    }
  }
  return { ok: false, failure: 'timeout' }
}

let syncing: Promise<void> | null = null

/** Brings the member's plan, and the prices and lengths of the plans, in line with the server. The server decides what is paid for. */
export function syncPlan(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const { data, error } = await supabase().rpc('my_plan')
    const d = data as { ok?: boolean; subscription?: RemoteSub | null; plans?: RemotePlan[] } | null
    if (error || !d || d.ok !== true || !Array.isArray(d.plans)) return
    const byId = new Map(d.plans.map((p) => [p.id, p]))
    update((s) => ({
      subscription: d.subscription ? toSubscription(d.subscription) : null,
      content: { ...s.content, plans: s.content.plans.map((p) => (byId.has(p.id) ? { ...p, priceKes: byId.get(p.id)!.price_kes, days: byId.get(p.id)!.days, enabled: byId.get(p.id)!.enabled } : p)) },
    }))
  })().finally(() => {
    syncing = null
  })
  return syncing
}

export interface Payment {
  id: string
  title: string
  amountKes: number | null
  receiptNo: string | null
  paidAt: number
  refundable: boolean
  refund: { status: 'pending' | 'approved' | 'declined'; at: number } | null
}

/** The member's recent payments and where any refund request stands. Null when the server can't be reached. */
export async function loadPayments(): Promise<Payment[] | null> {
  const r = await rpc('my_payments')
  return r.ok && Array.isArray(r.payments) ? (r.payments as Payment[]) : null
}

/** Asks for a refund on a payment made in the last 14 days. Billing staff decide; the member sees the answer on the same screen. */
export async function requestRefund(orderId: string, reason: string): Promise<Res> {
  const r = await rpc('request_refund', { p_order: orderId, p_reason: reason })
  return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error, code: r.code }
}

export const remoteBilling = {
  ...mockBilling,

  async createCheckout(item: CheckoutItem): Promise<Res<{ title: string; amountKes: number | null }>> {
    if (!getDb().account) return { ok: false, error: 'Sign in first.' }
    const r = item.kind === 'plan'
      ? await rpc('start_checkout', { p_plan: item.planId, p_auto_renew: item.autoRenew })
      : await rpc('start_session_checkout', { p_therapist: item.therapistId, p_mode: item.mode, p_start: new Date(item.start).toISOString() })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    const amountKes = (r.amount_kes as number | null) ?? null
    update({ checkout: { id: String(r.order_id), item, amountKes, createdAt: now() } })
    const pct = Number(r.discount_pct ?? 0)
    // The server has already taken the plan's discount off the price; the title says so, so the lower price isn't a surprise.
    const title = pct > 0 ? `${String(r.title)} (${pct}% off with your plan)` : String(r.title)
    return { ok: true, value: { title, amountKes } }
  },

  /**
   * M-Pesa goes through Safaricom: the server asks for the prompt on the member's phone, and this waits for the answer.
   * When M-Pesa isn't set up on the server (or for card), only test numbers can complete a payment.
   */
  async pay(method: PaymentMethod): Promise<PaymentResult> {
    const db = getDb()
    const co = db.checkout
    if (!co) return { ok: false, failure: 'cancelled' }
    if (method === 'mpesa') {
      const live = await payWithMpesa(co.id)
      if (live) {
        if (live.ok) {
          update({ checkout: null })
          if (co.item.kind === 'plan') await syncPlan()
          else await Promise.all([syncSessions(), syncChats(), syncDirectory()])
        } else if (live.failure === 'taken') void syncDirectory()
        return live
      }
    }
    const outcome = db.demo.failNextPayment ? 'timeout' : 'success'
    if (db.demo.failNextPayment) update((s) => ({ demo: { ...s.demo, failNextPayment: false } }))
    // The prompt on the phone takes a moment, so the screen waits a little.
    const [r] = await Promise.all([rpc('simulate_payment', { p_order: co.id, p_method: method, p_outcome: outcome }), pause(wait.ms)])
    if (r.ok) {
      update({ checkout: null })
      if (co.item.kind === 'plan') await syncPlan()
      else await Promise.all([syncSessions(), syncChats(), syncDirectory()])
      return { ok: true, receiptNo: String(r.receipt_no), sessionId: r.session_id ? String(r.session_id) : undefined }
    }
    if (r.code === 'taken') {
      void syncDirectory()
      return { ok: false, failure: 'taken' }
    }
    if (r.code === 'timeout' || r.code === 'insufficient') return { ok: false, failure: r.code }
    if (r.code === 'unavailable' || r.code === 'network') return { ok: false, failure: 'unavailable' }
    return { ok: false, failure: 'cancelled' }
  },

  cancelCheckout(): void {
    const co = getDb().checkout
    mockBilling.cancelCheckout()
    if (co) void rpc('cancel_checkout', { p_order: co.id })
  },

  cancelPlan(): void {
    mockBilling.cancelPlan()
    void rpc('cancel_plan').then(() => syncPlan())
  },

  setAutoRenew(on: boolean): void {
    mockBilling.setAutoRenew(on)
    void rpc('set_auto_renew', { p_on: on }).then(() => syncPlan())
  },
}
