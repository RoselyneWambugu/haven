import type { AdminAppeal, PortalState, StaffRole } from '@/api/types'

export type DecisionKind = 'warning' | 'paused' | 'suspended'
export type AppealOutcome = 'upheld' | 'reduced' | 'overturned'

export interface TherapistDecision {
  kind: DecisionKind
  by: string
  at: number
  text: string
}

export const MIN_STATEMENT = 20
export const THERAPIST_APPEAL_SLA_HOURS = 72

/** The decision a therapist can appeal. A suspension outranks a pause or warning. */
export function currentDecision(review: PortalState['review'], standing: { reason: string; by: string; at: number } | undefined): TherapistDecision | null {
  if (standing) return { kind: 'suspended', by: standing.by, at: standing.at, text: standing.reason }
  if (review) return { kind: review.kind, by: review.by ?? 'A clinical reviewer', at: review.at, text: review.text }
  return null
}

export const decisionLabel = (k: DecisionKind): string => (k === 'suspended' ? 'Suspension' : k === 'paused' ? 'Pause on new clients' : 'Warning')

/** What is left in force after an appeal. Reducing steps a decision down one level; overturning removes it. */
export function afterAppeal(kind: DecisionKind, outcome: AppealOutcome): { review: 'warning' | 'paused' | null; suspended: boolean } {
  const keep = { review: kind === 'suspended' ? null : kind, suspended: kind === 'suspended' }
  if (outcome === 'upheld') return keep
  if (outcome === 'overturned') return { review: null, suspended: false }
  if (kind === 'suspended') return { review: 'paused', suspended: false }
  if (kind === 'paused') return { review: 'warning', suspended: false }
  return { review: null, suspended: false }
}

export function validateStatement(text: string): string | null {
  const t = text.trim()
  if (t.length < MIN_STATEMENT) return `Tell us your side in at least ${MIN_STATEMENT} characters.`
  if (t.length > 2000) return 'Please keep it under 2,000 characters.'
  return null
}

/** Only clinical reviewers and Admins read therapist appeals; moderators and billing staff do not. */
export const canSeeAppeal = (role: StaffRole, a: Pick<AdminAppeal, 'therapistId'>): boolean => !a.therapistId || role === 'clinical' || role === 'admin'
