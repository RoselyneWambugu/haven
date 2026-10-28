import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { currentDecision, decisionLabel, THERAPIST_APPEAL_SLA_HOURS, validateStatement } from '@/lib/therapistAppeal'
import { getDb, update } from '@/store/db'
import type { AdminAppeal, Res } from './types'

/** A therapist appealing a clinical decision about them (a warning, a pause on new clients, or a suspension). */
export const therapistAppeals = {
  /** The decision currently in force that this therapist could appeal. */
  decision() {
    const db = getDb()
    const p = db.portal
    if (!p) return null
    return currentDecision(p.review, db.admin?.therapistStanding?.[p.therapistId])
  },

  /** The therapist's latest appeal, if any. */
  latest(): AdminAppeal | null {
    const db = getDb()
    const id = db.portal?.therapistId
    return db.admin?.appeals.find((a) => a.therapistId === id) ?? null
  },

  submit(statement: string): Res {
    const db = getDb()
    const p = db.portal
    const d = therapistAppeals.decision()
    if (!p || !db.admin || !d) return { ok: false, error: 'There is no decision to appeal.', code: 'none' }
    const err = validateStatement(statement)
    if (err) return { ok: false, error: err, code: 'statement' }
    const prior = therapistAppeals.latest()
    if (prior && prior.status === 'open') return { ok: false, error: 'You already have an appeal waiting for a decision.', code: 'open' }
    const name = THERAPISTS.find((t) => t.id === p.therapistId)?.name ?? 'Therapist'
    const appeal: AdminAppeal = {
      id: uid('AP'), noticeId: null, caseId: '', penName: name, decision: `${decisionLabel(d.kind)}: ${d.text}`, decidedBy: d.by, statement: statement.trim(),
      openedAt: now(), slaHours: THERAPIST_APPEAL_SLA_HOURS, status: 'open', reviewer: null, therapistId: p.therapistId,
    }
    update((s) => (s.admin ? { admin: { ...s.admin, appeals: [appeal, ...s.admin.appeals] } } : {}))
    return { ok: true, value: undefined }
  },
}
