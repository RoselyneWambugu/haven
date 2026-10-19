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
  language: 'en' | 'sw'
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

export type ReportTarget = 'message' | 'post' | 'comment' | 'member' | 'session'
export type ReportReason = 'harassment' | 'threats' | 'sexual' | 'scam' | 'self-harm' | 'impersonation' | 'hate' | 'other'

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
