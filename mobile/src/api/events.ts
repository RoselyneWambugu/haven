import { canManageEvents } from '@/lib/admin'
import { now } from '@/lib/clock'
import { THERAPISTS } from '@/data/seed'
import { isLive, isOver, MAX_PENDING_PROPOSALS, validateNewEvent, validateProposal, type NewEventInput } from '@/lib/events'
import { uid } from '@/lib/id'
import { getDb, update } from '@/store/db'
import { requirePlan } from './access'
import { notify } from './notify'
import { log, me } from './admin'
import type { CommunityEvent, PortalNote, Res } from './types'

const addNote = (title: string, body: string): void => {
  const n: PortalNote = { id: uid('pn'), title, body, href: '/portal/events', at: now(), read: false }
  update((s) => ({ portalNotes: [n, ...s.portalNotes].slice(0, 30) }))
}
const setEvent = (id: string, fn: (e: CommunityEvent) => CommunityEvent) => update((s) => ({ events: s.events.map((e) => (e.id === id ? fn(e) : e)) }))

export const events = {
  /** Marks the member as interested, or takes it back. Needs a plan, like the rest of the Community. */
  toggleInterest(id: string): Res {
    const gate = requirePlan('Events')
    if (gate) return gate
    const e = getDb().events.find((x) => x.id === id)
    if (!e || !isLive(e) || e.cancelled || isOver(e, now())) return { ok: false, error: 'That event isn’t open any more.', code: 'gone' }
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
    if (!isLive(e)) return { ok: false, error: 'Only an event that is live can be cancelled. Decide a proposal instead.', code: 'not-live' }
    if (e.cancelled) return { ok: false, error: 'It is already cancelled.' }
    if (isOver(e, now())) return { ok: false, error: 'It has already finished.', code: 'over' }
    if (reason.trim().length < 5) return { ok: false, error: 'A reason is required.', code: 'reason' }
    setEvent(id, (x) => ({ ...x, cancelled: { reason: reason.trim(), at: now() } }))
    if (e.interestedByMe) notify.push('event', `e:${id}:cancelled`, 'An event you were interested in was cancelled', `${e.title} won’t go ahead. ${reason.trim()}`, `/events/${id}`)
    log('Cancelled event', e.title, reason.trim())
    return { ok: true, value: undefined }
  },

  /** A therapist proposes an event. It waits for a clinical reviewer, and members don't see it until it is approved. */
  propose(input: Omit<NewEventInput, 'host'>): Res<{ id: string }> {
    const p = getDb().portal
    if (!p || !p.signedIn) return { ok: false, error: 'Sign in to the therapist portal first.', code: 'not-therapist' }
    const th = THERAPISTS.find((x) => x.id === p.therapistId)
    if (!th) return { ok: false, error: 'This isn’t a therapist account.', code: 'not-therapist' }
    if (getDb().admin?.therapistStanding?.[th.id] || th.suspended) return { ok: false, error: 'Your account is paused, so you can’t propose events.', code: 'suspended' }
    const err = validateProposal(input, th.name, now())
    if (err) return { ok: false, error: err, code: 'invalid' }
    if (getDb().events.filter((e) => e.status === 'pending' && e.proposedBy === th.name).length >= MAX_PENDING_PROPOSALS) {
      return { ok: false, error: 'You already have three proposals waiting. Wait for a decision, or withdraw one.', code: 'too-many' }
    }
    const id = uid('ev')
    const e: CommunityEvent = {
      id, title: input.title.trim(), blurb: input.blurb.trim(), kind: input.kind, mode: input.mode, place: input.place.trim(), startsAt: input.startsAt,
      durationMin: input.durationMin, host: th.name, interested: 0, interestedByMe: false, createdBy: th.name, status: 'pending', proposedBy: th.name,
    }
    update((s) => ({ events: [...s.events, e].sort((x, y) => x.startsAt - y.startsAt) }))
    return { ok: true, value: { id } }
  },

  /** A therapist takes back a proposal that is still waiting. */
  withdraw(id: string): Res {
    const p = getDb().portal
    const th = THERAPISTS.find((x) => x.id === p?.therapistId)
    const e = getDb().events.find((x) => x.id === id)
    if (!p?.signedIn || !th || !e || e.proposedBy !== th.name || e.status !== 'pending') return { ok: false, error: 'That proposal isn’t waiting any more.', code: 'gone' }
    setEvent(id, (x) => ({ ...x, status: 'withdrawn' }))
    return { ok: true, value: undefined }
  },

  /** A clinical reviewer or Admin approves a proposal (it goes live) or declines it with a reason the therapist reads. */
  decide(id: string, approve: boolean, reason = ''): Res {
    const a = getDb().admin
    if (!a || !a.signedIn || !canManageEvents(a.role)) return { ok: false, error: 'Only clinical reviewers and Admins decide event proposals.', code: 'role' }
    const e = getDb().events.find((x) => x.id === id)
    if (!e || e.status !== 'pending') return { ok: false, error: 'That proposal isn’t waiting any more.', code: 'gone' }
    if (approve) {
      if (e.startsAt < now() + 60 * 60_000) return { ok: false, error: 'The start time is too close or has passed. Decline it and ask for a new time.', code: 'late' }
      setEvent(id, (x) => ({ ...x, status: 'live' }))
      addNote('Your event was approved', `${e.title} is now live for members to see and say they are interested.`)
      log('Approved event proposal', e.title, `Proposed by ${e.proposedBy}`)
    } else {
      if (reason.trim().length < 5) return { ok: false, error: 'Say why, so the therapist can improve it.', code: 'reason' }
      setEvent(id, (x) => ({ ...x, status: 'declined', declineReason: reason.trim() }))
      addNote('Your event proposal was declined', `${e.title}. Reason: “${reason.trim()}”. You can edit it and send it again.`)
      log('Declined event proposal', e.title, reason.trim())
    }
    return { ok: true, value: undefined }
  },

  /** A therapist edits a proposal that is waiting, or one that was declined (which sends it back for review). */
  edit(id: string, input: Omit<NewEventInput, 'host'>): Res {
    const p = getDb().portal
    const th = THERAPISTS.find((x) => x.id === p?.therapistId)
    const e = getDb().events.find((x) => x.id === id)
    if (!p?.signedIn || !th || !e || e.proposedBy !== th.name || (e.status !== 'pending' && e.status !== 'declined')) return { ok: false, error: 'That proposal can’t be edited any more.', code: 'gone' }
    const err = validateProposal(input, th.name, now())
    if (err) return { ok: false, error: err, code: 'invalid' }
    if (e.status === 'declined' && getDb().events.filter((x) => x.status === 'pending' && x.proposedBy === th.name).length >= MAX_PENDING_PROPOSALS) {
      return { ok: false, error: 'You already have three proposals waiting. Wait for a decision, or withdraw one.', code: 'too-many' }
    }
    setEvent(id, (x) => ({ ...x, title: input.title.trim(), blurb: input.blurb.trim(), kind: input.kind, mode: input.mode, place: input.place.trim(), startsAt: input.startsAt, durationMin: input.durationMin, status: 'pending', declineReason: undefined }))
    return { ok: true, value: undefined }
  },

  /** The therapist has seen their notices. */
  markNotesRead(): void {
    update((s) => ({ portalNotes: s.portalNotes.map((n) => ({ ...n, read: true })) }))
  },
}
