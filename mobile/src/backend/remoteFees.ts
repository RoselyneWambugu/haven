import type { Res } from '@/api/types'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

export interface Payout { id: string; netKes: number; grossKes: number; feeKes: number; sessions: number; method: string; status: 'requested' | 'paid'; requestedAt: number; paidAt?: number | null; reference?: string | null }
export interface Earnings { feePct: number; availableNet: number; availableSessions: number; pendingNet: number; payouts: Payout[] }
export interface FeeState { pct: number; pending: { id: string; pct: number; requestedBy: string; mine: boolean } | null }
export interface StaffPayout extends Payout { therapist: string; paidBy?: string | null }

// ---------- the therapist ----------

/** Earnings after the platform fee, what can be withdrawn now, and past withdrawals. Null when offline. */
export async function loadEarnings(): Promise<Earnings | null> {
  const d = await call<Reply & Partial<Earnings>>('portal_earnings')
  return d.ok && d.payouts ? (d as Earnings) : null
}

/** Withdraws everything that has cleared the 24 hour hold. Billing sends the money and marks it paid. */
export async function requestPayout(): Promise<Res<{ netKes: number }>> {
  const r = await call<Reply & { netKes?: number }>('portal_request_payout')
  return r.ok ? { ok: true, value: { netKes: r.netKes ?? 0 } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
}

// ---------- staff ----------

export async function loadFee(): Promise<FeeState | null> {
  const d = await call<Reply & Partial<FeeState>>('admin_fee')
  return d.ok && d.pct !== undefined ? { pct: d.pct, pending: d.pending ?? null } : null
}

export async function proposeFee(pct: number): Promise<Res<{ applied: boolean }>> {
  const r = await call<Reply & { applied?: boolean }>('admin_propose_fee', { p_pct: pct })
  return r.ok ? { ok: true, value: { applied: r.applied === true } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
}
export const decideFee = async (id: string, approve: boolean): Promise<Res> => res(await call('admin_decide_fee', { p_id: id, p_approve: approve }))
export const withdrawFee = async (id: string): Promise<Res> => res(await call('admin_withdraw_fee', { p_id: id }))

export async function loadStaffPayouts(): Promise<StaffPayout[] | null> {
  const d = await call<Reply & { payouts?: StaffPayout[] }>('admin_payouts')
  return d.ok && d.payouts ? d.payouts : null
}
export const markPayoutPaid = async (id: string, reference: string): Promise<Res> => res(await call('admin_mark_payout_paid', { p_id: id, p_reference: reference }))
