import { groups as mockGroups } from '@/api/groups'
import { notify } from '@/api/notify'
import type { GroupChat, ReportReason, Res } from '@/api/types'
import type { NewGroupInput } from '@/lib/groupChat'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

/** Tells the member when a room they signed up for was cancelled, or when a moderator removed them. Each only once. */
function noteChanges(before: GroupChat[], after: GroupChat[]): void {
  for (const g of after) {
    const was = before.find((x) => x.id === g.id)
    if (g.cancelled && g.registered !== false && was && !was.cancelled && was.registered) {
      notify.push('session', `g:${g.id}:cancelled`, 'Your group chat was cancelled', `${g.topic} won’t go ahead. We’re sorry. There will be another soon.`, `/group-chats/${g.id}`)
    }
    if (g.removed?.length && was && !was.removed?.length) {
      notify.push('safety', `g:${g.id}:removed`, 'You were removed from a group chat', `A moderator removed you from “${g.topic}” because it broke the group’s rules. You can still use the rest of Echo.`, `/group-chats/${g.id}`)
    }
  }
}

let syncing: Promise<void> | null = null
let last = 0

/** The member's list of group chats, with the messages of the ones they are signed up for. */
export function syncGroups(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const d = await call<Reply & { groups?: GroupChat[] }>('group_list')
    if (!d.ok || !d.groups) return
    const before = getDb().groupChats
    // A cancelled room keeps the member's own sign-up for the notice above, so it is read before it is replaced.
    const next = d.groups.map((g) => (g.cancelled && before.find((x) => x.id === g.id)?.registered ? { ...g, registered: true } : g))
    noteChanges(before, next)
    update({ groupChats: next })
    last = Date.now()
  })().finally(() => {
    syncing = null
  })
  return syncing
}

/** Staff see every room, with who is signed up. */
export async function syncStaffGroups(): Promise<void> {
  const d = await call<Reply & { groups?: GroupChat[] }>('admin_groups')
  if (!d.ok || !d.groups) return
  update({ groupChats: d.groups })
}

/** A facilitator's rooms, with the whole conversation. */
export interface FacilitatorRoom {
  id: string
  topic: string
  blurb: string
  startsAt: number
  durationMin: number
  capacity: number
  status: 'upcoming' | 'lobby' | 'open' | 'ended'
  registered: number
  messages: { id: string; name: string; text: string; at: number; mine: boolean }[]
}

export async function loadFacilitatorRooms(): Promise<FacilitatorRoom[] | null> {
  const d = await call<Reply & { groups?: FacilitatorRoom[] }>('portal_groups')
  return d.ok && d.groups ? d.groups : null
}

export async function facilitatorSend(id: string, text: string): Promise<Res> {
  return res(await call('portal_group_send', { p_id: id, p_text: text }))
}

export const remoteGroups = {
  ...mockGroups,
  /** The server keeps one upcoming room per topic, so there is nothing to make here. */
  ensure(): void {},
  /** Asks the server for the latest, at most every few seconds, however often the app calls this. */
  tick(): void {
    if (Date.now() - last > 8000 && getDb().signedIn) void syncGroups()
  },
  async register(id: string): Promise<Res> {
    const r = await call('group_register', { p_id: id })
    await syncGroups()
    if (r.ok) showToast('You’re signed up. We’ll remind you.')
    return res(r)
  },
  async unregister(id: string): Promise<void> {
    await call('group_unregister', { p_id: id })
    await syncGroups()
  },
  async send(id: string, text: string): Promise<Res> {
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a message first.', code: 'empty' }
    const r = await call('group_send', { p_id: id, p_text: t })
    if (r.ok) await syncGroups()
    return res(r)
  },
  async report(id: string, messageId: string, reason: ReportReason): Promise<void> {
    const r = await call('group_report', { p_id: id, p_message: messageId, p_reason: reason })
    if (r.ok) showToast('Thank you. A moderator will look at this.')
  },
  async schedule(input: NewGroupInput): Promise<Res<{ id: string }>> {
    const r = await call<Reply & { id?: string }>('admin_schedule_group', {
      p_topic: input.topic, p_blurb: input.blurb, p_facilitator: input.facilitatorId,
      p_starts: new Date(input.startsAt).toISOString(), p_duration: input.durationMin, p_capacity: input.capacity,
    })
    await syncStaffGroups()
    return r.ok ? { ok: true, value: { id: r.id ?? '' } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },
  async cancel(id: string, reason: string): Promise<Res> {
    const r = await call('admin_cancel_group', { p_id: id, p_reason: reason })
    await syncStaffGroups()
    return res(r)
  },
  async removeParticipant(id: string, name: string, reason: string): Promise<Res> {
    const r = await call('admin_remove_from_group', { p_id: id, p_pen_name: name, p_reason: reason })
    await syncStaffGroups()
    return res(r)
  },
}

