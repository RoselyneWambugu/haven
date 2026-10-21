import { THERAPISTS } from '@/data/seed'
import { canJoin, SESSION_MINUTES, MIN, HOUR } from '@/lib/booking'
import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { blocksToCells, cellKey, cellsToBlocks, nextCell, split, isAvailable, type Cell } from '@/lib/portal'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { detectSolicitation } from '@/lib/portal'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import type { Attendance, ConcernType, ForumComment, Message, PortalProfile, PortalSession, PortalState, PortalThread, Res } from './types'

const THERAPIST_ID = 't-amina'
const msg = (from: Message['from'], text: string, at = now()): Message => ({ id: uid('m'), from, text, at })

function seed(): PortalState {
  const t = THERAPISTS.find((x) => x.id === THERAPIST_ID)!
  const n = now()
  const sess = (clientName: string, clientAvatar: PortalSession['clientAvatar'], mode: PortalSession['mode'], start: number, number: number, done = false): PortalSession => ({
    id: uid('ps'), clientKey: clientName, clientName, clientAvatar, mode, start, end: start + SESSION_MINUTES * MIN, number,
    status: done ? 'completed' : 'booked', attendance: done ? 'attended' : null, note: done ? 'Discussed sleep and routine.' : '', followUp: null, grossKes: done ? t.priceKes : null,
  })
  const thread = (clientName: string, clientAvatar: PortalThread['clientAvatar'], lines: [Message['from'], string][], unread: number, closed = false, nextSession: number | null = null): PortalThread => ({
    id: uid('th'), clientName, clientAvatar, messages: lines.map(([f, x], i) => msg(f, x, n - (lines.length - i) * 20 * MIN)), unread, closed, nextSession,
  })
  return {
    signedIn: true,
    therapistId: THERAPIST_ID,
    application: 'approved',
    paused: false,
    caps: { perDay: 5, bufferMin: 15, newPerWeek: 3 },
    availability: t.availability.map((b) => ({ ...b })),
    timeOff: [],
    profile: { bio: t.bio, specialisations: [...t.specialisations], languages: [...t.languages], modes: [...t.modes], priceKes: t.priceKes },
    sessions: [
      sess('NightOwl22', 'moon', 'voice', n + 12 * MIN, 1),
      sess('RainyDay', 'wave', 'video', n + 3 * HOUR, 4),
      sess('KindLeaf', 'fern', 'chat', n + 6 * HOUR, 2),
      sess('RainyDay', 'wave', 'video', n - 3 * 24 * HOUR, 3, true),
      sess('KindLeaf', 'fern', 'chat', n - 2 * 24 * HOUR, 1, true),
      sess('NightOwl22', 'moon', 'voice', n - 6 * HOUR, 0, true),
    ],
    threads: [
      thread('NightOwl22', 'moon', [['them', 'Thanks, see you soon.'], ['me', 'Looking forward to it. Have a calm evening.']], 1, false, n + 12 * MIN),
      thread('RainyDay', 'wave', [['them', 'Slept better this week.']], 0, false, n + 3 * HOUR),
      thread('KindLeaf', 'fern', [['them', 'Can we move to Friday?']], 1, false, n + 6 * HOUR),
      thread('MorningSun', 'sun', [['me', 'It was good to meet you. Take care.']], 0, true),
    ],
    concerns: [],
    payout: { method: 'M-Pesa 0722 ••• 114', schedule: 'weekly' },
    licenceValidTo: n + 45 * 24 * HOUR,
    reauthUntil: 0,
  }
}

function patch(fn: (p: PortalState) => Partial<PortalState>) {
  update((s) => (s.portal ? { portal: { ...s.portal, ...fn(s.portal) } } : {}))
}

/** What members see in the directory follows what the therapist publishes. A real backend would do this itself. */
/** Whether staff have suspended this therapist. */
export const isSuspended = (therapistId: string): boolean => !!getDb().admin?.therapistStanding?.[therapistId]

/** Hides suspended therapists from the directory and stops bookings with them. */
export function applyStandingToDirectory(): void {
  for (const t of THERAPISTS) {
    const off = isSuspended(t.id)
    t.suspended = off
    if (off) t.acceptingNew = false
  }
}

export function applyPortalToDirectory(): void {
  const p = getDb().portal
  if (!p) return
  const t = THERAPISTS.find((x) => x.id === p.therapistId)
  if (!t) return
  const blocked = p.timeOff
  Object.assign(t, {
    bio: p.profile.bio, specialisations: p.profile.specialisations, languages: p.profile.languages, modes: p.profile.modes,
    priceKes: p.profile.priceKes, availability: p.availability, acceptingNew: !p.paused && !isSuspended(p.therapistId) && blocked.every((b) => !(b.start <= now() && now() < b.end)),
  })
}

export const portal = {
  signIn(): void {
    const cur = getDb().portal
    if (cur) patch(() => ({ signedIn: true }))
    else update({ portal: seed() })
  },
  signOut(): void {
    patch(() => ({ signedIn: false }))
  },

  // --- application (THR-1 to THR-3) ---
  submitApplication(): void {
    update((s) => ({ portal: { ...(s.portal ?? { ...seed(), signedIn: false }), application: 'submitted' } }))
  },
  /** Reviewers decide later. This moves the application along for demos. */
  advanceReview(): void {
    const a = getDb().portal?.application
    patch(() => ({ application: a === 'submitted' ? 'more-info' : a === 'more-info' ? 'approved' : (a ?? 'none') }))
  },
  resubmit(): void {
    patch(() => ({ application: 'submitted' }))
  },

  // --- availability (THR-5, THR-16) ---
  setCell(dow: number, hour: number, cell?: Cell): void {
    const p = getDb().portal
    if (!p) return
    const cells = blocksToCells(p.availability)
    const cur = cells[cellKey(dow, hour)] ?? 'off'
    cells[cellKey(dow, hour)] = cell ?? nextCell(cur)
    patch(() => ({ availability: cellsToBlocks(cells) }))
    applyPortalToDirectory()
  },
  /** A pause set by a clinical review can't be switched off here. A clinical reviewer lifts it. */
  setPaused(paused: boolean): Res {
    if (!paused && getDb().portal?.review?.kind === 'paused') return { ok: false, error: 'This pause was set by a clinical review. A clinical reviewer will lift it.', code: 'review' }
    patch(() => ({ paused }))
    applyPortalToDirectory()
    return { ok: true, value: undefined }
  },
  setCaps(caps: Partial<PortalState['caps']>): void {
    patch((p) => ({ caps: { ...p.caps, ...caps } }))
  },
  /** Returns how many booked clients are told their session is affected. */
  addTimeOff(start: number, end: number): Res<{ notified: number }> {
    const p = getDb().portal
    if (!p) return { ok: false, error: 'Sign in first.' }
    if (end <= start) return { ok: false, error: 'The end must be after the start.' }
    const hit = p.sessions.filter((s) => s.status === 'booked' && s.start < end && s.end > start)
    patch((x) => ({ timeOff: [...x.timeOff, { id: uid('to'), start, end }] }))
    applyPortalToDirectory()
    if (hit.length) showToast(`${hit.length} client${hit.length === 1 ? ' was' : 's were'} told and offered a new time.`)
    return { ok: true, value: { notified: hit.length } }
  },
  removeTimeOff(id: string): void {
    patch((p) => ({ timeOff: p.timeOff.filter((t) => t.id !== id) }))
    applyPortalToDirectory()
  },

  // --- public profile (THR-4) ---
  saveProfile(next: PortalProfile): Res {
    const bio = next.bio.trim()
    if (bio.length < 20) return { ok: false, error: 'Write a little more. A short bio helps members choose.', code: 'bio' }
    const check = detectBlockedContent(bio)
    if (check.blocked) return { ok: false, error: `Your bio can’t include contact details or links. ${explainBlock(check.reasons)}`, code: 'blocked' }
    if (detectSolicitation(bio)) return { ok: false, error: 'Describe how you work, not how to reach you outside Echo.', code: 'solicit' }
    if (!next.specialisations.length) return { ok: false, error: 'Choose at least one specialisation.', code: 'spec' }
    if (!next.languages.length) return { ok: false, error: 'Choose at least one language.', code: 'lang' }
    if (!next.modes.length) return { ok: false, error: 'Choose at least one session type.', code: 'modes' }
    patch(() => ({ profile: { ...next, bio } }))
    applyPortalToDirectory()
    return { ok: true, value: undefined }
  },

  // --- inbox (clients are a pen name and avatar only) ---
  openThread(id: string): void {
    patch((p) => ({ threads: p.threads.map((t) => (t.id === id ? { ...t, unread: 0 } : t)) }))
  },
  send(threadId: string, text: string): Res {
    const p = getDb().portal
    const th = p?.threads.find((t) => t.id === threadId)
    if (!p || !th) return { ok: false, error: 'That conversation is gone.' }
    if (th.closed) return { ok: false, error: 'This thread is closed.', code: 'closed' }
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a message first.', code: 'empty' }
    const check = detectBlockedContent(t)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    patch((x) => ({ threads: x.threads.map((h) => (h.id === threadId ? { ...h, messages: [...h.messages, msg('me', t)] } : h)) }))
    setTimeout(() => {
      patch((x) => ({ threads: x.threads.map((h) => (h.id === threadId && !h.closed ? { ...h, messages: [...h.messages, msg('them', 'Thank you. That helps.')], unread: h.unread } : h)) }))
    }, 2500)
    return { ok: true, value: undefined }
  },
  closeThread(id: string): void {
    patch((p) => ({ threads: p.threads.map((t) => (t.id === id ? { ...t, closed: true, messages: [...t.messages, msg('system', 'You closed this thread.')] } : t)) }))
  },
  /** Moves the offer to booking rather than private contact. */
  offerTime(id: string, start: number): void {
    patch((p) => ({
      threads: p.threads.map((t) => (t.id === id ? { ...t, messages: [...t.messages, msg('system', `You offered a session on ${new Date(start).toISOString().slice(0, 10)}. The client can book it from Echo.`)] } : t)),
    }))
  },

  // --- sessions (THR-17, THR-19) ---
  join(id: string): Res {
    const s = getDb().portal?.sessions.find((x) => x.id === id)
    if (!s) return { ok: false, error: 'Session not found.' }
    if (s.status === 'completed') return { ok: false, error: 'This session has ended.', code: 'done' }
    if (s.status !== 'in-progress' && !canJoin(s.start, s.end, now())) return { ok: false, error: 'The session isn’t open yet. You can join 10 minutes before.', code: 'early' }
    patch((p) => ({ sessions: p.sessions.map((x) => (x.id === id ? { ...x, status: 'in-progress' } : x)) }))
    return { ok: true, value: undefined }
  },
  setNote(id: string, note: string): void {
    patch((p) => ({ sessions: p.sessions.map((x) => (x.id === id ? { ...x, note } : x)) }))
  },
  wrapUp(id: string, input: { attendance: Attendance; note: string; followUp: number | null }): Res {
    const p = getDb().portal
    const s = p?.sessions.find((x) => x.id === id)
    if (!p || !s) return { ok: false, error: 'Session not found.' }
    // A no-show is paid only under the late-change rule (D39), so it is flagged for billing rather than paid here.
    const gross = input.attendance === 'no-show' ? null : p.profile.priceKes
    patch((x) => ({
      sessions: x.sessions.map((q) => (q.id === id ? { ...q, status: 'completed', attendance: input.attendance, note: input.note, followUp: input.followUp, grossKes: gross, end: Math.min(q.end, now()) } : q)),
    }))
    return { ok: true, value: undefined }
  },

  // --- raising a concern (THR-18) ---
  raiseConcern(input: { sessionId: string | null; danger: boolean; type: ConcernType; detail: string }): Res<{ id: string }> {
    const id = uid('cn')
    patch((p) => ({ concerns: [...p.concerns, { id, sessionId: input.sessionId, danger: input.danger, type: input.type, detail: input.detail.trim(), at: now() }] }))
    return { ok: true, value: { id } }
  },

  // --- forum (FRM-2, FRM-8) ---
  forumReply(postId: string, text: string): Res<{ comment: ForumComment }> {
    const p = getDb().portal
    const post = getDb().posts.find((x) => x.id === postId)
    if (!p || !post) return { ok: false, error: 'That post is gone.' }
    const t = text.trim()
    if (t.length < 10) return { ok: false, error: 'Write a little more.', code: 'short' }
    const check = detectBlockedContent(t)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    if (detectSolicitation(t)) return { ok: false, error: 'Replies share general information. They can’t invite people to book with you or contact you.', code: 'solicit' }
    const th = THERAPISTS.find((x) => x.id === p.therapistId)!
    const comment: ForumComment = { id: uid('cm'), authorName: th.name, authorAvatar: 'leaf', therapistId: th.id, therapistName: th.name, text: t, at: now(), hiddenReason: null, mine: false }
    update((s) => ({ posts: s.posts.map((x) => (x.id === postId ? { ...x, comments: [...x.comments, comment] } : x)) }))
    return { ok: true, value: { comment } }
  },

  // --- earnings (THR-20) ---
  earnings(): { rows: (ReturnType<typeof split> & { id: string; at: number; client: string; mode: string; available: boolean })[]; available: number | null; pending: number | null } {
    const p = getDb().portal
    const done = (p?.sessions ?? []).filter((s) => s.status === 'completed' && s.grossKes !== null).sort((a, b) => b.end - a.end)
    const rows = done.map((s) => ({ id: s.id, at: s.end, client: s.clientName, mode: s.mode, available: isAvailable(s.end, now()), ...split(s.grossKes, s.feeKes) }))
    const sum = (list: typeof rows) => (list.length ? list.reduce((n, r) => n + (r.net ?? 0), 0) : 0)
    return { rows, available: sum(rows.filter((r) => r.available)), pending: sum(rows.filter((r) => !r.available)) }
  },
  /** On the real backend this sends a code to the therapist's phone. The demo shows the code on screen instead. */
  async reauthStart(): Promise<void> {},
  /** Changing where money goes needs a fresh check (THR-20). The demo code is shown on screen. */
  reauth(code: string): Res {
    if (code !== DEMO_REAUTH_CODE) return { ok: false, error: 'That code doesn’t match.' }
    patch(() => ({ reauthUntil: now() + 5 * MIN }))
    return { ok: true, value: undefined }
  },
  changePayout(method: string, schedule: PortalState['payout']['schedule']): Res {
    const p = getDb().portal
    if (!p || p.reauthUntil < now()) return { ok: false, error: 'Check it’s you first.', code: 'reauth' }
    patch(() => ({ payout: { method, schedule }, reauthUntil: 0 }))
    return { ok: true, value: undefined }
  },
}

export const DEMO_REAUTH_CODE = '246810'
