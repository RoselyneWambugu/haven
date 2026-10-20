/**
 * The contract between the app and its backend. Everything the screens know
 * about the outside world is described here. The mock in `./mock.ts` implements
 * it today; a real service can implement the same `Api` later.
 */
import type { AgeBand } from '@/lib/identity'
import type { AvailabilityBlock, Mode } from '@/lib/booking'

export type { Mode, AvailabilityBlock }

// ---------- people ----------

export type AvatarKind = 'moon' | 'leaf' | 'wave' | 'star' | 'pine' | 'sun' | 'fern' | 'drop'

export const SPOKEN_LANGUAGES = ['English', 'Kiswahili', 'Sheng', 'Dholuo', 'Kikuyu', 'Kalenjin', 'Luhya', 'Kamba', 'Somali'] as const

export const FORUM_TOPICS = ['Anxiety', 'Grief', 'Loneliness', 'Relationships', 'Family', 'Work stress', 'Life changes', 'Wellbeing'] as const

export interface PublicProfile {
  penName: string
  avatar: AvatarKind
  languages: string[]
  ageBand: AgeBand
  topics: string[]
  openToChats: boolean
  penNameChangedAt: number | null
}

export interface PrivateProfile {
  fullName: string
  phone: string // +2547XXXXXXXX
  email: string
  dob: string // ISO date
  idVerified: boolean
}

export interface Peer {
  id: string
  penName: string
  avatar: AvatarKind
  languages: string[]
  ageBand: AgeBand
  /** Community topics they follow. Only used to break ties, and only if staff turn it on (MAT-7, D17). */
  topics?: string[]
}

// ---------- account ----------

export interface Consents {
  terms: boolean
  privacy: boolean
  guidelines: boolean
  moderation: boolean
  version: string
  at: number
}

export interface Device {
  id: string
  name: string
  kind: 'phone' | 'web'
  lastActiveAt: number
  approxPlace: string
  current: boolean
}

export type StandingState = 'good' | 'restricted' | 'paused'
export type AppealStatus = 'none' | 'pending' | 'upheld' | 'reduced' | 'overturned'

export interface Notice {
  id: string
  kind: 'warning' | 'restriction' | 'suspension'
  rule: string
  explanation: string
  at: number
  expiresAt: number | null
  appeal: AppealStatus
  appealText?: string
}

export interface Settings {
  notifyMessages: boolean
  notifySessions: boolean
  notifyForum: boolean
  notifyPlan: boolean
  quietHours: boolean
  hideTextOnLockScreen: boolean
  neutralNotifications: boolean
  appLock: boolean
  lockAfterSeconds: number
  hidePenNameOnLock: boolean
  quickExit: boolean
  disappearingDefault: 'ask' | 'on' | 'off'
}

export interface Account {
  id: string
  public: PublicProfile
  private: PrivateProfile
  consents: Consents
  createdAt: number
  settings: Settings
  notices: Notice[]
  standing: StandingState
  devices: Device[]
  trustedDevice: boolean
  sharedDevice: boolean
  blocked: Peer[]
  deletionRequestedAt: number | null
  mood: { value: 1 | 2 | 3 | 4 | 5; at: number } | null
  hasPostedBefore: boolean
}

// ---------- conversations ----------

export interface Message {
  id: string
  from: 'me' | 'them' | 'system'
  text: string
  at: number
}

export type DisappearingState = 'off' | 'proposed-by-me' | 'proposed-by-them' | 'on'

export interface Conversation {
  id: string
  kind: 'peer' | 'therapist'
  peer: Peer | null
  therapistId: string | null
  messages: Message[]
  muted: boolean
  archived: boolean
  ended: boolean
  disappearing: DisappearingState
  unread: number
  createdAt: number
  lastAt: number
  /** The member's private "Did you feel heard?" answer, or 'skipped'. Never shown to the other person (FDB-1). */
  heard?: { score: number; comment: string } | 'skipped'
  /** Set once the "ending soon" note has been added. */
  warned?: boolean
}

export type FeedbackKind = 'idea' | 'bug' | 'other'

/** In-app feedback or a bug report from Settings (FDB-3). */
export interface FeedbackItem {
  id: string
  kind: FeedbackKind
  text: string
  at: number
  /** Whether the member agreed to send the app version and platform with it. */
  withDevice: boolean
  /** Set when a member of staff has read and dealt with it. */
  reviewedBy?: string
}

export type MatchState =
  | { state: 'idle' }
  | { state: 'searching'; startedAt: number }
  | { state: 'found'; conversationId: string }
  | { state: 'paused' }

// ---------- forum ----------

export interface ForumComment {
  id: string
  authorName: string
  authorAvatar: AvatarKind
  therapistId: string | null
  therapistName: string | null
  text: string
  at: number
  hiddenReason: 'contact' | null
  mine: boolean
}

export interface ForumPost {
  id: string
  authorName: string
  authorAvatar: AvatarKind
  topic: string
  title: string
  body: string
  createdAt: number
  supports: number
  supportedByMe: boolean
  comments: ForumComment[]
  status: 'published' | 'pending' | 'hidden'
  mine: boolean
  authorKey: string
  /** The support space this post belongs to. Space posts stay out of the general community feed. */
  space?: string
}

// ---------- therapists and sessions ----------

export type PortraitTone = 'a' | 'b' | 'c' | 'd'

export interface Therapist {
  id: string
  name: string
  title: string
  tone: PortraitTone
  bio: string
  specialisations: string[]
  languages: string[]
  modes: Mode[]
  priceKes: number | null
  rating: number
  reviews: number
  licenceBody: string
  licenceNumber: string
  licenceValidTo: number
  gender: 'woman' | 'man'
  availability: AvailabilityBlock[]
  acceptingNew: boolean
  /** Set when staff suspend the therapist. They are hidden from the directory and can't be booked. */
  suspended?: boolean
}

export type SessionStatus = 'booked' | 'completed' | 'cancelled' | 'missed'

export interface Session {
  id: string
  therapistId: string
  mode: Mode
  start: number
  end: number
  status: SessionStatus
  priceKes: number | null
  receiptNo: string
  createdAt: number
  rating: { stars: number; comment: string } | null
  followUpOffer: number | null
  lateChargeApplied: boolean
}

// ---------- plans and payments ----------

export type PlanId = 'daily' | 'monthly' | 'yearly'

export interface PlanDef {
  id: PlanId
  label: string
  period: string
  blurb: string
  priceKes: number | null
  days: number
}

export interface Subscription {
  planId: PlanId
  startedAt: number
  endsAt: number
  autoRenew: boolean
  cancelledAt: number | null
  method: 'mpesa' | 'card'
  receiptNo: string
}

export type PaymentMethod = 'mpesa' | 'card'

export type CheckoutItem =
  | { kind: 'plan'; planId: PlanId; autoRenew: boolean }
  | { kind: 'session'; therapistId: string; mode: Mode; start: number }

export interface PaymentResult {
  ok: boolean
  receiptNo?: string
  failure?: 'timeout' | 'insufficient' | 'cancelled'
  sessionId?: string
}

// ---------- help ----------

export interface HelpDepartment {
  id: string
  title: string
  blurb: string
  icon: 'rocket' | 'person' | 'lock' | 'shield' | 'wallet' | 'heart' | 'forum' | 'tool' | 'pencil' | 'ticket'
}

export interface HelpArticle {
  id: string
  deptId: string
  title: string
  intro: string
  steps: string[]
  updatedAt: number
  related: string[]
}

export interface TicketMessage {
  id: string
  from: 'me' | 'staff'
  text: string
  at: number
}

export interface Ticket {
  id: string
  deptId: string
  subject: string
  status: 'open' | 'replied' | 'resolved'
  unread: boolean
  messages: TicketMessage[]
  createdAt: number
  routedToCrisis: boolean
}

export interface CrisisLine {
  name: string
  phone: string
  hours: string
  languages: string
}

export interface SupportOrg {
  id: string
  name: string
  type: 'Counselling' | 'Helpline' | 'Legal'
  cost: string
  hours: string
  languages: string
  action: 'call' | 'web' | 'contact'
  value: string
}

// ---------- reports ----------

/** A member's report, with the content frozen when it was made (PRD SAF-3). */
export interface ReportRecord {
  id: string
  target: string
  targetId: string
  reason: string
  note: string
  at: number
  /** The pen name of the person reported, when it is known. */
  reportedName?: string
  snapshot?: EvidenceLine[]
  priorReports?: number
  /** Concerns about a therapist go to the clinical queue. */
  queue?: 'clinical'
  therapistId?: string
  /** The chat that was reported, so it is kept past 24 hours. */
  conversationId?: string
  /** The group chat that was reported, so it is kept past 24 hours. */
  groupChatId?: string
}

// ---------- timed group chats ----------

export interface GroupMessage {
  id: string
  name: string
  avatar: AvatarKind
  text: string
  at: number
  mine?: boolean
  facilitator?: boolean
  /** A note from Echo, such as the closing line. */
  system?: boolean
}

/** A facilitated group chat at a set time, on one topic, with a limited number of places. */
export interface GroupChat {
  id: string
  topic: string
  blurb: string
  facilitatorId: string
  startsAt: number
  durationMin: number
  capacity: number
  /** Places already taken by other people (a stand-in; the real service knows). */
  takenOthers: number
  registered: boolean
  messages: GroupMessage[]
  /** How many scripted lines have been posted, so each is posted once. */
  posted: number
  /** Set when the closing note has been posted. */
  closed?: boolean
  warned?: boolean
}

export type ReportTarget = 'message' | 'post' | 'comment' | 'member' | 'session'
/** The last three are concerns about a therapist, and go to Clinical reviewers. */
export type ReportReason = 'harassment' | 'threats' | 'sexual' | 'scam' | 'self-harm' | 'impersonation' | 'hate' | 'other' | 'therapist-conduct' | 'therapist-boundaries' | 'therapist-privacy'

// ---------- results ----------

export type Res<T = void> = { ok: true; value: T } | { ok: false; error: string; code?: string }

/** What the mock exposes for review and demos. A real backend has none of this. */
export interface DemoControls {
  grantPlan(planId: PlanId): void
  lapsePlan(): void
  setStanding(s: StandingState): void
  failNextPayment(on: boolean): void
  newDeviceAlert(): void
  advanceClock(minutes: number): void
  reset(): void
}

// ---------- therapist portal ----------

export type Attendance = 'attended' | 'late' | 'no-show'
export type ConcernType = 'self-harm' | 'harm-to-others' | 'abuse' | 'behaviour'

export interface PortalSession {
  id: string
  clientKey: string
  clientName: string
  clientAvatar: AvatarKind
  mode: Mode
  start: number
  end: number
  number: number
  status: 'booked' | 'in-progress' | 'completed'
  attendance: Attendance | null
  note: string
  followUp: number | null
  grossKes: number | null
}

export interface PortalThread {
  id: string
  clientName: string
  clientAvatar: AvatarKind
  messages: Message[]
  unread: number
  closed: boolean
  nextSession: number | null
}

export interface PortalConcern {
  id: string
  sessionId: string | null
  danger: boolean
  type: ConcernType
  detail: string
  at: number
}

export interface PortalProfile {
  bio: string
  specialisations: string[]
  languages: string[]
  modes: Mode[]
  priceKes: number | null
}

export interface PortalState {
  signedIn: boolean
  therapistId: string
  application: 'none' | 'submitted' | 'more-info' | 'approved'
  paused: boolean
  /** Set by a clinical review of a concern about this therapist. A pause set this way is lifted only by a clinical reviewer. */
  review?: { kind: 'warning' | 'paused'; text: string; at: number; by?: string } | null
  caps: { perDay: number; bufferMin: number; newPerWeek: number }
  availability: AvailabilityBlock[]
  timeOff: { id: string; start: number; end: number }[]
  profile: PortalProfile
  sessions: PortalSession[]
  threads: PortalThread[]
  concerns: PortalConcern[]
  payout: { method: string; schedule: 'weekly' | 'monthly' }
  licenceValidTo: number
  reauthUntil: number
}

// ---------- admin dashboard ----------

export type StaffRole = 'moderator' | 'clinical' | 'billing' | 'admin'
export type Severity = 'S1' | 'S2' | 'S3'
export type CaseStatus = 'new' | 'in-review' | 'waiting' | 'closed'
export type CaseSource = 'user-report' | 'ai-flag' | 'crisis-flag' | 'appeal'
export type CaseAction = 'dismiss' | 'strike' | 'restrict' | 'suspend' | 'escalate' | 'warn-therapist' | 'pause-therapist'

export interface EvidenceLine {
  id: string
  who: 'reporter' | 'reported'
  text: string
  reported?: boolean
}

export interface AdminCase {
  id: string
  severity: Severity
  source: CaseSource
  type: string
  /** Minutes left on the SLA clock when the case was seeded or created, measured from `openedAt`. */
  slaMinutes: number
  openedAt: number
  owner: string | null
  status: CaseStatus
  reporter: string | null
  reported: string
  evidence: EvidenceLine[]
  snapshotAt: number
  ai: { category: string; confidence: number; model: string } | null
  strikes: number
  priorReports: number
  /** Which team works it. Therapist concerns are for Clinical reviewers; the rest are for moderators. */
  queue?: 'clinical'
  /** For a therapist concern: which therapist it is about. */
  therapistId?: string
  decision: { action: CaseAction; reason: string; by: string; at: number } | null
  escalated: boolean
}

export interface AdminUser {
  id: string
  penName: string
  joined: string
  languages: string
  ageBand: string
  standing: StandingState
  strikes: { id: string; at: number; rule: string; kind: string }[]
  reportsAgainst: number
  reportsMade: number
  blocksReceived: number
  plan: string
  matches: number
  skips: number
  /** True for the member signed in on this device. Staff actions on them change the real member app. */
  isMember: boolean
}

export interface AdminAppeal {
  id: string
  noticeId: string | null
  caseId: string
  penName: string
  decision: string
  decidedBy: string
  statement: string
  openedAt: number
  slaHours: number
  status: 'open' | 'upheld' | 'reduced' | 'overturned'
  reviewer: string | null
  /** Set when a therapist is appealing a clinical decision about them. */
  therapistId?: string
  /** The reviewer's explanation, shown to a therapist. Members see theirs on the notice. */
  response?: string
}

export interface BreakGlassRequest {
  id: string
  caseId: string
  target: string
  reasonCode: 'imminent-risk' | 'legal' | 'fraud'
  justification: string
  requestedBy: string
  requestedAt: number
  status: 'pending' | 'approved' | 'declined' | 'expired'
  approvedBy: string | null
  expiresAt: number | null
}

export interface AdminRefund {
  id: string
  penName: string
  plan: string
  reason: string
  status: 'pending' | 'approved' | 'declined'
  decidedBy: string | null
}

export interface AdminFlag {
  id: string
  category: string
  confidence: number
  model: string
  outcome: 'upheld' | 'overturned' | 'open'
  reviewMinutes: number | null
}

export interface Applicant {
  id: string
  name: string
  licenceNo: string
  licenceExpiry: number
  checklist: { name: boolean; licence: boolean; expiry: boolean; qualification: boolean }
  status: 'pending' | 'approved' | 'info' | 'rejected'
  message: string
}

export interface StrikePolicy {
  expiryDays: number
  restrictionHours: number
}

export interface AuditEntry {
  id: string
  at: number
  actor: string
  role: StaffRole | 'system'
  action: string
  target: string
  reason: string
}

export interface AdminState {
  signedIn: boolean
  role: StaffRole
  staffName: string
  /** Reveals each reviewer has made today, and when they last took a break (ADM-5). */
  exposure: Record<string, Exposure>
  /** Keys are `name|caseId:lineId`, so each reviewer reveals for themselves. */
  revealed: string[]
  staff: StaffAccount[]
  pendingStaff: { change: StaffChange; requestedBy: string } | null
  wellbeing: WellbeingCfg
  /** Therapists staff have suspended, by therapist id. */
  therapistStanding?: Record<string, { reason: string; by: string; at: number }>
  /** Who works the heavy queue (Severity-1 and crisis cases) each week. */
  rota: RotaWeek[]
  cases: AdminCase[]
  users: AdminUser[]
  appeals: AdminAppeal[]
  breakGlass: BreakGlassRequest[]
  refunds: AdminRefund[]
  unmatchedPayments: number
  flags: AdminFlag[]
  applicants: Applicant[]
  policy: StrikePolicy
  policyChange: { policy: StrikePolicy; requestedBy: string; approvals: string[] } | null
  audit: AuditEntry[]
}

// ---------- editable content and configuration (admin: Resources, Configuration) ----------

export type DepartmentOwner = 'Support' | 'Billing' | 'Moderation' | 'Clinical' | 'Tech'

export interface DepartmentCfg extends HelpDepartment {
  owner: DepartmentOwner
  /** Response-time target for tickets, in hours (HLP-1a). */
  slaHours: number
  enabled: boolean
}

export interface ArticleCfg extends HelpArticle {
  published: boolean
}

export interface CrisisLineCfg extends CrisisLine {
  id: string
}

export interface SupportOrgCfg extends SupportOrg {
  archived: boolean
}

export interface ServiceSuggestion {
  id: string
  name: string
  note: string
  at: number
  status: 'new' | 'accepted' | 'declined'
}

export interface PlanCfg extends PlanDef {
  enabled: boolean
  entitlements: { disappearing: boolean; therapistDiscountPct: number }
}

export interface MatchingCfg {
  /** If nobody in the same age range is free, look in the neighbouring ranges (MAT-1). */
  neighbourFallback: boolean
  /** 0 means topics are never used. Above 0 they break ties between people who already share an age range and a language (MAT-7, D17). */
  softTopicWeight: number
  /** Days before two people who ended a match can be matched again (MAT-4). */
  rematchCooldownDays: number
}

export interface FlagsCfg {
  forum: boolean
  moodCheckin: boolean
  disappearing: boolean
  therapistVideo: boolean
}

export interface LimitsCfg {
  graceDays: number
  penNameChangeDays: number
  deletionHoldDays: number
}

export interface ContentState {
  departments: DepartmentCfg[]
  articles: ArticleCfg[]
  popular: string[]
  emergency: CrisisLine
  crisisLines: CrisisLineCfg[]
  /** When a Clinical Reviewer last checked the numbers (CRS-2, HLP-8). Null means never. */
  crisisVerifiedAt: number | null
  supportOrgs: SupportOrgCfg[]
  suggestions: ServiceSuggestion[]
  topics: string[]
  plans: PlanCfg[]
  pendingPlans: { plans: PlanCfg[]; requestedBy: string; approvals: string[] } | null
  matching: MatchingCfg
  flags: FlagsCfg
  limits: LimitsCfg
}

export interface StaffAccount {
  id: string
  name: string
  role: StaffRole
  active: boolean
  lastSignInAt: number | null
}

export type StaffChange =
  | { kind: 'add'; name: string; role: StaffRole }
  | { kind: 'role'; id: string; role: StaffRole }
  | { kind: 'active'; id: string; active: boolean }

export interface Exposure {
  /** Reveals made today. */
  count: number
  /** Reveals since the last break. */
  sinceBreak: number
  /** While this is in the future, the reviewer is on a break and can't reveal. */
  breakUntil: number | null
}

export interface WellbeingCfg {
  dailyLimit: number
  /** Suggest a break after this many reveals in a row. */
  breakEvery: number
  breakMinutes: number
}

export interface RotaWeek {
  weekStart: number
  heavy: string[]
}
