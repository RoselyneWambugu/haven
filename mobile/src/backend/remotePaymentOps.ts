import type { Res } from '@/api/types'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

export interface PaymentEvent {
  id: number
  kind: 'refund_needed' | 'amount_mismatch' | 'unverified' | 'unknown_callback' | 'payment_failed' | 'bad_callback' | string
  reference: string | null
  at: number
  resolved: boolean
  resolvedBy?: string | null
  resolution?: string | null
  penName?: string | null
  amountKes?: number | null
  what?: string | null
  detail: string
}
export interface SmsQueue { queued: number; sent24h: number; failed: number; oldestQueuedMinutes: number | null; failures: { id: number; kind: string; phoneTail: string; error: string | null; at: number }[] }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

export async function loadPaymentEvents(): Promise<PaymentEvent[] | null> {
  const d = await call<Reply & { events?: PaymentEvent[] }>('admin_payment_events')
  return d.ok && d.events ? d.events : null
}
export const resolvePaymentEvent = async (id: number, note: string): Promise<Res> => res(await call('admin_resolve_payment_event', { p_id: id, p_note: note }))

export async function loadSmsQueue(): Promise<SmsQueue | null> {
  const d = await call<Reply & Partial<SmsQueue>>('admin_sms_queue')
  return d.ok && d.failures ? (d as SmsQueue) : null
}
export const retrySms = async (id: number): Promise<Res> => res(await call('admin_retry_sms', { p_id: id }))
