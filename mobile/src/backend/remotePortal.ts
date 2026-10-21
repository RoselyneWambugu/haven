import { portal as mockPortal } from '@/api/portal'
import type { AdminAppeal, AvatarKind, ConcernType, ForumComment, Message, PortalConcern, PortalProfile, PortalSession, PortalState, PortalThread, Res } from '@/api/types'
import type { AvailabilityBlock, Mode } from '@/lib/booking'
import { now } from '@/lib/clock'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'
import { stopPolling } from './remoteChat'
import { syncForum } from './remoteForum'
import { rpc, syncDirectory } from './remoteTherapists'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
const ms = (iso: string): number => new Date(iso).getTime()

interface RemotePortal {
  therapist_id: string
  paused: boolean
  caps: PortalState['caps']
  profile: PortalProfile
  availability: AvailabilityBlock[]
  time_off: { id: string; start: number; end: number }[]
  payout: PortalState['payout']
  licence_valid_to: number
  sessions: { id: string; client_key: string; client_name: string; client_avatar: AvatarKind; mode: Mode; start: number; end: number; number: number; status: PortalSession['status']; attendance: PortalSession['attendance']; note: string; follow_up: number | null; gross_kes: number | null }[]
  threads: { id: string; client_name: string; client_avatar: AvatarKind; unread: number; closed: boolean; next_session: number | null; messages: { id: string; from: Message['from']; text: string; at: string }[] }[]
  concerns: { id: string; session_id: string | null; danger: boolean; type: ConcernType; detail: string; at: number }[]
}

function toPortal(d: RemotePortal, prev: PortalState | null): PortalState {
  return {
    signedIn: true,
    therapistId: d.therapist_id,
    application: 'approved',
    paused: d.paused,
    review: prev?.review ?? null,
    appealState: prev?.appealState,
    caps: d.caps,
    availability: d.availability,
    timeOff: d.time_off,
    profile: d.profile,
    sessions: d.sessions.map((s): PortalSession => ({ id: s.id, clientKey: s.client_key, clientName: s.client_name, clientAvatar: s.client_avatar, mode: s.mode, start: s.start, end: s.end, number: s.number, status: s.status, attendance: s.attendance, note: s.note, followUp: s.follow_up, grossKes: s.gross_kes })),
    threads: d.threads.map((t): PortalThread => ({ id: t.id, clientName: t.client_name, clientAvatar: t.client_avatar, unread: t.unread, closed: t.closed, nextSession: t.next_session, messages: t.messages.map((m) => ({ id: m.id, from: m.from, text: m.text, at: ms(m.at) })) })),
    concerns: d.concerns.map((c): PortalConcern => ({ id: c.id, sessionId: c.session_id, danger: c.danger, type: c.type, detail: c.detail, at: c.at })),
    payout: d.payout,
    licenceValidTo: d.licence_valid_to,
    reauthUntil: prev?.reauthUntil ?? 0,
  }
}

type ServerDecision = NonNullable<NonNullable<PortalState['appealState']>['decision']>
interface ServerAppeal { id: string; status: 'open' | 'upheld' | 'reduced' | 'overturned'; response: string | null; openedAt: number; slaHours: number }

/** What is in force against the therapist, and where their appeal stands. A warning or a pause also shows as the notice on Today. */
async function syncAppealState(): Promise<void> {
  const { data } = await supabase().rpc('portal_appeal_state')
  const d = data as { ok?: boolean; decision?: ServerDecision | null; appeal?: ServerAppeal | null } | null
  if (!d?.ok) return
  const therapist = getDb().portal?.therapistId ?? ''
  const latest: AdminAppeal | null = d.appeal
    ? { id: d.appeal.id, noticeId: null, caseId: '', penName: '', decision: '', decidedBy: '', statement: '', openedAt: d.appeal.openedAt, slaHours: d.appeal.slaHours, status: d.appeal.status, reviewer: null, therapistId: therapist, response: d.appeal.response ?? undefined }
    : null
  const decision = d.decision ?? null
  update((s) => (s.portal ? { portal: { ...s.portal, appealState: { decision, latest }, review: decision && decision.kind !== 'suspended' ? { kind: decision.kind, text: decision.text, at: decision.at, by: decision.by } : null } } : {}))
}

let syncing: Promise<boolean> | null = null

/** Brings the therapist's schedule, inbox, sessions and settings in line with the server. False when this sign-in isn't a therapist. */
export function syncPortal(): Promise<boolean> {
  if (syncing) return syncing
  syncing = (async () => {
    const { data, error } = await supabase().rpc('my_portal')
    const d = data as ({ ok?: boolean } & Partial<RemotePortal>) | null
    if (error || !d) return !!getDb().portal?.signedIn
    if (d.ok !== true || !d.therapist_id) return false
    update((s) => ({ portal: toPortal(d as RemotePortal, s.portal) }))
    await syncAppealState()
    return true
  })().finally(() => {
    syncing = null
  })
  return syncing
}

let timer: ReturnType<typeof setInterval> | null = null
let ticks = 0

/** While a therapist is signed in, the portal asks the server for new messages and bookings every few seconds. */
export function startPortalPolling(): void {
  if (timer) return
  timer = setInterval(() => {
    if (!getDb().portal?.signedIn) return stopPortalPolling()
    ticks += 1
    void syncPortal()
    if (ticks % 3 === 0) void syncForum()
  }, 4000)
  void syncPortal()
  void syncForum()
  void syncDirectory()
}

export function stopPortalPolling(): void {
  if (timer) clearInterval(timer)
  timer = null
}

let signInPhone: string | null = null

/** Step one of a therapist's sign-in: a code goes to their phone. */
export async function portalRequestOtp(phone: string): Promise<Res> {
  const { error } = await supabase().auth.signInWithOtp({ phone, options: { shouldCreateUser: true } })
  if (error) return { ok: false, error: 'We couldn’t send a code. Check the number and try again.', code: 'send' }
  signInPhone = phone
  return { ok: true, value: undefined }
}

/** Step two: the code opens the portal if the number belongs to a therapist. A member signed in on this device is signed out of the member app. */
export async function portalVerifyOtp(code: string): Promise<Res> {
  if (!signInPhone) return { ok: false, error: 'Ask for a new code.', code: 'none' }
  const { error } = await supabase().auth.verifyOtp({ phone: signInPhone, token: code.trim(), type: 'sms' })
  if (error) return { ok: false, error: 'That code doesn’t match, or it has expired.', code: 'wrong' }
  stopPolling()
  update({ signedIn: false, account: null, conversations: [], match: { state: 'idle' }, posts: [], spaces: [], subscription: null, checkout: null, sessions: [], admin: null })
  if (!(await syncPortal())) {
    await supabase().auth.signOut()
    update({ portal: null })
    return { ok: false, error: 'This number isn’t linked to a therapist account. Ask Echo to link it.', code: 'not-therapist' }
  }
  startPortalPolling()
  return { ok: true, value: undefined }
}

/** Opens the portal again on start-up if the saved session still belongs to a therapist. */
export async function restorePortal(): Promise<void> {
  if (!getDb().portal?.signedIn) return
  const { data } = await supabase().auth.getSession()
  if (!data.session || !(await syncPortal())) {
    update((s) => ({ portal: s.portal ? { ...s.portal, signedIn: false } : null }))
    return
  }
  startPortalPolling()
}

const settle = (call: Promise<{ ok: boolean; error?: string }>): void => {
  void call.then((r) => {
    if (!r.ok && r.error) showToast(r.error)
    return syncPortal()
  })
}

let availabilityTimer: ReturnType<typeof setTimeout> | null = null

export const remoteTherapistAppeals = {
  decision() {
    const d = getDb().portal?.appealState?.decision
    return d ?? null
  },
  latest(): AdminAppeal | null {
    return getDb().portal?.appealState?.latest ?? null
  },
  async submit(statement: string): Promise<Res> {
    const { data, error } = await supabase().rpc('portal_appeal', { p_statement: statement })
    const d = data as { ok?: boolean; error?: string; code?: string } | null
    if (error || !d) return { ok: false, error: OFFLINE }
    await syncAppealState()
    return d.ok ? { ok: true, value: undefined } : { ok: false, error: d.error ?? OFFLINE, code: d.code }
  },
}

export const remotePortal = {
  ...mockPortal,

  /** The real sign-in is by phone; there is no demo sign-in on the real backend. */
  signIn(): void {},

  signOut(): void {
    stopPortalPolling()
    update({ portal: null, posts: [] })
    void supabase().auth.signOut()
  },

  setCell(dow: number, hour: number, cell?: Parameters<typeof mockPortal.setCell>[2]): void {
    mockPortal.setCell(dow, hour, cell)
    if (availabilityTimer) clearTimeout(availabilityTimer)
    // A therapist taps several hours in a row, so the grid is saved a moment after the last tap.
    availabilityTimer = setTimeout(() => {
      const blocks = getDb().portal?.availability ?? []
      settle(rpc('portal_save_availability', { p_blocks: blocks }))
    }, 600)
  },

  setPaused(paused: boolean): Res {
    const r = mockPortal.setPaused(paused)
    if (r.ok) settle(rpc('portal_set_paused', { p_paused: paused }))
    return r
  },

  setCaps(caps: Partial<PortalState['caps']>): void {
    mockPortal.setCaps(caps)
    settle(rpc('portal_set_caps', { p_per_day: caps.perDay ?? null, p_buffer: caps.bufferMin ?? null, p_new: caps.newPerWeek ?? null }))
  },

  async addTimeOff(start: number, end: number): Promise<Res<{ notified: number }>> {
    const r = await rpc('portal_add_time_off', { p_start: new Date(start).toISOString(), p_end: new Date(end).toISOString() })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    const notified = Number(r.notified ?? 0)
    if (notified) showToast(`${notified} client${notified === 1 ? ' was' : 's were'} told and offered a new time.`)
    return { ok: true, value: { notified } }
  },

  removeTimeOff(id: string): void {
    mockPortal.removeTimeOff(id)
    settle(rpc('portal_remove_time_off', { p_id: id }))
  },

  async saveProfile(next: PortalProfile): Promise<Res> {
    const r = await rpc('portal_save_profile', { p_bio: next.bio, p_specs: next.specialisations, p_langs: next.languages, p_modes: next.modes })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    return { ok: true, value: undefined }
  },

  openThread(id: string): void {
    mockPortal.openThread(id)
    void rpc('mark_read', { p_conversation: id })
  },

  async send(threadId: string, text: string): Promise<Res> {
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a message first.', code: 'empty' }
    // Checked here for a quick answer, and again on the server.
    const check = detectBlockedContent(t)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const r = await rpc('portal_send', { p_conversation: threadId, p_text: t })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    return { ok: true, value: undefined }
  },

  closeThread(id: string): void {
    settle(rpc('portal_close_thread', { p_conversation: id }))
  },

  offerTime(id: string, start: number): void {
    settle(rpc('portal_offer_time', { p_conversation: id, p_start: new Date(start).toISOString() }))
  },

  async join(id: string): Promise<Res> {
    const r = await rpc('portal_join_session', { p_id: id })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    return { ok: true, value: undefined }
  },

  setNote(id: string, note: string): void {
    mockPortal.setNote(id, note)
    void rpc('portal_set_note', { p_id: id, p_note: note })
  },

  async wrapUp(id: string, input: { attendance: 'attended' | 'late' | 'no-show'; note: string; followUp: number | null }): Promise<Res> {
    const r = await rpc('portal_wrap_up', { p_id: id, p_attendance: input.attendance, p_note: input.note, p_follow_up: input.followUp ? new Date(input.followUp).toISOString() : null })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    return { ok: true, value: undefined }
  },

  async raiseConcern(input: { sessionId: string | null; danger: boolean; type: ConcernType; detail: string }): Promise<Res<{ id: string }>> {
    const r = await rpc('portal_raise_concern', { p_session: input.sessionId, p_danger: input.danger, p_type: input.type, p_detail: input.detail })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    return { ok: true, value: { id: String(r.id) } }
  },

  async forumReply(postId: string, text: string): Promise<Res<{ comment: ForumComment }>> {
    const r = await rpc('portal_forum_reply', { p_post: postId, p_text: text })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncForum()
    const comment = getDb().posts.find((p) => p.id === postId)?.comments.find((c) => c.id === String(r.comment_id))
    if (!comment) return { ok: false, error: OFFLINE, code: 'network' }
    return { ok: true, value: { comment } }
  },

  /** Changing where money goes needs a fresh code. This sends it to the therapist's phone. */
  async reauthStart(): Promise<void> {
    const { data } = await supabase().auth.getUser()
    const phone = data.user?.phone
    if (phone) {
      signInPhone = phone.startsWith('+') ? phone : `+${phone}`
      await supabase().auth.signInWithOtp({ phone: signInPhone, options: { shouldCreateUser: false } })
    }
  },

  async reauth(code: string): Promise<Res> {
    if (!signInPhone) return { ok: false, error: 'Ask for a new code.' }
    const { error } = await supabase().auth.verifyOtp({ phone: signInPhone, token: code.trim(), type: 'sms' })
    if (error) return { ok: false, error: 'That code doesn’t match.' }
    update((s) => ({ portal: s.portal ? { ...s.portal, reauthUntil: now() + 5 * 60_000 } : null }))
    return { ok: true, value: undefined }
  },

  async changePayout(method: string, schedule: PortalState['payout']['schedule']): Promise<Res> {
    const r = await rpc('portal_change_payout', { p_method: method, p_schedule: schedule })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await syncPortal()
    update((s) => ({ portal: s.portal ? { ...s.portal, reauthUntil: 0 } : null }))
    return { ok: true, value: undefined }
  },
}
