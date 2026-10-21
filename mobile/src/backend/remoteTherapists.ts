import { sessions as mockSessions } from '@/api/care'
import type { AvailabilityBlock, Res, Session, SessionStatus, Therapist } from '@/api/types'
import { THERAPISTS } from '@/data/seed'
import { showToast } from '@/store/toast'
import { getDb, update } from '@/store/db'
import { supabase } from './client'

interface RemoteTherapist {
  id: string
  name: string
  title: string
  tone: Therapist['tone']
  gender: Therapist['gender']
  bio: string
  specialisations: string[]
  languages: string[]
  modes: Therapist['modes']
  price_kes: number | null
  licence_body: string
  licence_number: string
  licence_valid_to: number
  accepting_new: boolean
  rating_sum: number
  rating_count: number
  availability: AvailabilityBlock[]
  taken: number[]
}

interface RemoteSession {
  id: string
  therapist_id: string
  mode: Session['mode']
  start_at: string
  end_at: string
  status: SessionStatus
  price_kes: number | null
  receipt_no: string | null
  created_at: string
  late_charge: boolean
  follow_up_offer: string | null
  rating: { stars: number; comment: string } | null
}

type Reply = { ok: true; [k: string]: unknown } | { ok: false; code: string; error: string }
const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
const ms = (iso: string): number => new Date(iso).getTime()

export async function rpc(name: string, args?: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) return { ok: false, code: 'network', error: OFFLINE }
  return (data ?? { ok: true }) as Reply
}

const toSession = (s: RemoteSession): Session => ({
  id: s.id, therapistId: s.therapist_id, mode: s.mode, start: ms(s.start_at), end: ms(s.end_at), status: s.status, priceKes: s.price_kes, receiptNo: s.receipt_no ?? '',
  createdAt: ms(s.created_at), rating: s.rating, followUpOffer: s.follow_up_offer ? ms(s.follow_up_offer) : null, lateChargeApplied: s.late_charge,
})

let directory: RemoteTherapist[] = []

/**
 * The app reads therapists from one shared list. This fills it from the server. A therapist's rating here leaves out the
 * member's own ratings, because the screens add those back from the member's sessions.
 */
function applyDirectory(): void {
  const mine = getDb().sessions.filter((s) => s.rating)
  const list: Therapist[] = directory.map((t) => {
    const own = mine.filter((s) => s.therapistId === t.id)
    const baseCount = Math.max(0, t.rating_count - own.length)
    const baseSum = Math.max(0, t.rating_sum - own.reduce((a, s) => a + (s.rating?.stars ?? 0), 0))
    return {
      id: t.id, name: t.name, title: t.title, tone: t.tone, bio: t.bio, specialisations: t.specialisations, languages: t.languages, modes: t.modes, priceKes: t.price_kes,
      rating: baseCount ? baseSum / baseCount : 0, reviews: baseCount, licenceBody: t.licence_body, licenceNumber: t.licence_number, licenceValidTo: t.licence_valid_to,
      gender: t.gender, availability: t.availability, acceptingNew: t.accepting_new, takenStarts: t.taken,
    }
  })
  THERAPISTS.splice(0, THERAPISTS.length, ...list)
  update((s) => ({ directoryVersion: s.directoryVersion + 1 }))
}

let syncingDirectory: Promise<void> | null = null

/** Brings the therapist directory, with hours, prices and times already taken, in line with the server. */
export function syncDirectory(): Promise<void> {
  if (syncingDirectory) return syncingDirectory
  syncingDirectory = (async () => {
    const { data, error } = await supabase().rpc('therapist_directory')
    const d = data as { ok?: boolean; therapists?: RemoteTherapist[] } | null
    if (error || !d || d.ok !== true || !Array.isArray(d.therapists)) return
    directory = d.therapists
    applyDirectory()
  })().finally(() => {
    syncingDirectory = null
  })
  return syncingDirectory
}

let syncingSessions: Promise<void> | null = null

/** Brings the member's sessions in line with the server. */
export function syncSessions(): Promise<void> {
  if (syncingSessions) return syncingSessions
  syncingSessions = (async () => {
    const { data, error } = await supabase().rpc('my_sessions')
    const d = data as { ok?: boolean; sessions?: RemoteSession[] } | null
    if (error || !d || d.ok !== true || !Array.isArray(d.sessions)) return
    update({ sessions: d.sessions.map(toSession) })
    if (directory.length) applyDirectory()
  })().finally(() => {
    syncingSessions = null
  })
  return syncingSessions
}

/** What the member has on screen is cleared when they sign out. */
export function clearTherapistCache(): void {
  directory = []
}

type Outcome = { outcome: 'free' | 'late' }

export const remoteSessions = {
  ...mockSessions,

  async cancel(id: string): Promise<Res<Outcome>> {
    const r = await rpc('cancel_session', { p_id: id })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await Promise.all([syncSessions(), syncDirectory()])
    return { ok: true, value: { outcome: r.outcome as Outcome['outcome'] } }
  },

  async reschedule(id: string, newStart: number): Promise<Res<Outcome>> {
    const r = await rpc('reschedule_session', { p_id: id, p_start: new Date(newStart).toISOString() })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    await Promise.all([syncSessions(), syncDirectory()])
    return { ok: true, value: { outcome: r.outcome as Outcome['outcome'] } }
  },

  async join(id: string): Promise<Res> {
    const r = await rpc('join_session', { p_id: id })
    return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error, code: r.code }
  },

  /** The call itself is on the device for now; ending it records the session as finished. */
  end(id: string): void {
    mockSessions.end(id)
    void rpc('complete_session', { p_id: id }).then((r) => {
      if (!r.ok) showToast(r.error)
      return syncSessions()
    })
  },

  rate(id: string, stars: number, comment: string): void {
    mockSessions.rate(id, stars, comment)
    void rpc('rate_session', { p_id: id, p_stars: stars, p_comment: comment }).then(() => Promise.all([syncSessions(), syncDirectory()]))
  },
}
