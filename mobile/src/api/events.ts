import { canManageEvents } from '@/lib/admin'
import { now } from '@/lib/clock'
import { isOver, validateNewEvent, type NewEventInput } from '@/lib/events'
import { uid } from '@/lib/id'
import { getDb, update } from '@/store/db'
import { requirePlan } from './access'
import { log, me } from './admin'
import type { CommunityEvent, Res } from './types'

const setEvent = (id: string, fn: (e: CommunityEvent) => CommunityEvent) => update((s) => ({ events: s.events.map((e) => (e.id === id ? fn(e) : e)) }))

export const events = {
  /** Marks the member as interested, or takes it back. Needs a plan, like the rest of the Community. */
  toggleInterest(id: string): Res {
    const gate = requirePlan('Events')
    if (gate) return gate
    const e = getDb().events.find((x) => x.id === id)
    if (!e || e.cancelled || isOver(e, now())) return { ok: false, error: 'That event isn’t open any more.', code: 'gone' }
    setEvent(id, (x) => ({ ...x, interestedByMe: !x.interestedByMe, interested: Math.max(0, x.interested + (x.interestedByMe ? -1 : 1)) }))
    return { ok: true, value: undefined }
  },

  /** Staff schedule an event. Clinical reviewers and Admins only, and it is written to the audit log. */
  schedule(input: NewEventInput): Res<{ id: string }> {
    const a = getDb().admin
    if (!a || !a.signedIn || !canManageEvents(a.role)) return { ok: false, error: 'Only clinical reviewers and Admins schedule events.', code: 'role' }
    const err = validateNewEvent(input, now())
    if (err) return { ok: false, error: err, code: 'invalid' }
    const id = uid('ev')
    const e: CommunityEvent = {
      id, title: input.title.trim(), blurb: input.blurb.trim(), kind: input.kind, mode: input.mode, place: input.place.trim(), startsAt: input.startsAt,
      durationMin: input.durationMin, host: input.host.trim(), interested: 0, interestedByMe: false, createdBy: me().name,
    }
    update((s) => ({ events: [...s.events, e].sort((x, y) => x.startsAt - y.startsAt) }))
    log('Scheduled event', e.title, `${e.kind}, ${e.mode}`)
    return { ok: true, value: { id } }
  },

  /** Cancels an event that has not finished, with a reason. Anyone interested is told. */
  cancel(id: string, reason: string): Res {
    const a = getDb().admin
    if (!a || !a.signedIn || !canManageEvents(a.role)) return { ok: false, error: 'Only clinical reviewers and Admins cancel events.', code: 'role' }
    const e = getDb().events.find((x) => x.id === id)
    if (!e) return { ok: false, error: 'That event isn’t here.' }
    if (e.cancelled) return { ok: false, error: 'It is already cancelled.' }
    if (isOver(e, now())) return { ok: false, error: 'It has already finished.', code: 'over' }
    if (reason.trim().length < 5) return { ok: false, error: 'A reason is required.', code: 'reason' }
    setEvent(id, (x) => ({ ...x, cancelled: { reason: reason.trim(), at: now() } }))
    log('Cancelled event', e.title, reason.trim())
    return { ok: true, value: undefined }
  },
}
