import { events as mockEvents } from '@/api/events'
import type { CommunityEvent, Res } from '@/api/types'
import type { NewEventInput } from '@/lib/events'
import { getDb, update } from '@/store/db'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

let syncing: Promise<void> | null = null

/** The member's list of events. Without a plan the list is empty: the demo starter events are never shown against the real service. */
export function syncEvents(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const d = await call<Reply & { events?: CommunityEvent[] }>('event_list')
    if (d.ok && d.events) update({ events: d.events })
    else if (d.code === 'needs-plan') update({ events: [] })
  })().finally(() => {
    syncing = null
  })
  return syncing
}

/** Staff see every event, with who scheduled it. */
export async function syncStaffEvents(): Promise<void> {
  const d = await call<Reply & { events?: CommunityEvent[] }>('admin_events')
  if (d.ok && d.events) update({ events: d.events })
}

/** A therapist's own proposals, with each one's status. */
export async function syncPortalEvents(): Promise<void> {
  const d = await call<Reply & { events?: CommunityEvent[] }>('portal_events')
  if (d.ok && d.events) update({ events: d.events })
}

export const remoteEvents = {
  ...mockEvents,

  async toggleInterest(id: string): Promise<Res> {
    // Answer at once on the device, then take the server's word for it.
    const before = getDb().events
    mockEvents.toggleInterest(id)
    const r = await call('event_toggle_interest', { p_id: id })
    if (!r.ok) update({ events: before })
    await syncEvents()
    return res(r)
  },

  async schedule(input: NewEventInput): Promise<Res<{ id: string }>> {
    const r = await call<Reply & { id?: string }>('admin_schedule_event', {
      p_title: input.title, p_blurb: input.blurb, p_kind: input.kind, p_mode: input.mode, p_place: input.place,
      p_starts: new Date(input.startsAt).toISOString(), p_duration: input.durationMin, p_host: input.host,
    })
    await syncStaffEvents()
    return r.ok ? { ok: true, value: { id: r.id ?? '' } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },

  async cancel(id: string, reason: string): Promise<Res> {
    const r = await call('admin_cancel_event', { p_id: id, p_reason: reason })
    await syncStaffEvents()
    return res(r)
  },

  async propose(input: Omit<NewEventInput, 'host'>): Promise<Res<{ id: string }>> {
    const r = await call<Reply & { id?: string }>('portal_propose_event', {
      p_title: input.title, p_blurb: input.blurb, p_kind: input.kind, p_mode: input.mode, p_place: input.place,
      p_starts: new Date(input.startsAt).toISOString(), p_duration: input.durationMin,
    })
    await syncPortalEvents()
    return r.ok ? { ok: true, value: { id: r.id ?? '' } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },

  async withdraw(id: string): Promise<Res> {
    const r = await call('portal_withdraw_event', { p_id: id })
    await syncPortalEvents()
    return res(r)
  },

  async decide(id: string, approve: boolean, reason = ''): Promise<Res> {
    const r = await call('admin_decide_event', { p_id: id, p_approve: approve, p_reason: approve ? null : reason })
    await syncStaffEvents()
    return res(r)
  },
}
