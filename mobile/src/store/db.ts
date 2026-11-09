import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Account, Conversation, Device, CommunityEvent, FeedbackItem, PortalNote, ForumPost, GroupChat, ReportRecord, MatchState, Peer, Session, Subscription, Ticket, CheckoutItem, PortalState, AdminState, ContentState, EpisodeComment } from '@/api/types'
import { LIVE } from '@/data/config'
import { defaultContent } from '@/data/content'
import { seedEvents } from '@/data/events'
import { seedPosts } from '@/data/seed'
import { now } from '@/lib/clock'
import { applySessionMoney } from '@/lib/sessionMoney'
import { setOpenPlans } from '@/lib/plan'
import type { AppNote } from '@/lib/notifications'
import { secure } from './secure'

const KEY = 'echo.demo.v1'
const SESSION_KEY = 'echo.session.v1'

export interface RegistrationDraft {
  fullName: string
  phone: string
  dob: string
  email: string
  consentsAcceptedAt: number | null
  verified: boolean
  penName: string
  avatar: Account['public']['avatar']
  languages: string[]
  topics: string[]
}

export interface OtpState {
  phone: string
  code: string
  purpose: 'register' | 'login' | 'reauth'
  expiresAt: number
  attempts: number
  lockedUntil: number | null
}

export interface DbState {
  account: Account | null
  /** A therapist's own application, on the real backend. */
  application: { status: 'none' | 'pending' | 'info' | 'approved' | 'rejected'; message: string; name: string } | null
  /** Persisted in secure storage: whether a person is signed in on this device. */
  signedIn: boolean
  locked: boolean
  reauthUntil: number
  reg: RegistrationDraft | null
  /** Set while someone is signing up to apply as a therapist, so the email link they open takes them back to the application instead of to member sign-up. */
  signupFor: 'therapist' | null
  otp: OtpState | null
  match: MatchState
  conversations: Conversation[]
  posts: ForumPost[]
  hiddenPostIds: string[]
  mutedAuthors: string[]
  /** The demo's Watch reactions and comments (the live service keeps these on the server). */
  episodeSocial: { reactions: Record<string, -1 | 0 | 1>; comments: EpisodeComment[] }
  sessions: Session[]
  subscription: Subscription | null
  checkout: { id: string; item: CheckoutItem; amountKes: number | null; createdAt: number } | null
  tickets: Ticket[]
  feedback: FeedbackItem[]
  notifications: AppNote[]
  /** Support spaces the member has joined. */
  spaces: string[]
  /** Chats that ran out of time while reported. Kept for the safety review and never shown to the member. */
  retained: Conversation[]
  /** Timed group chats: upcoming, open and recently ended. */
  groupChats: GroupChat[]
  /** Community events: webinars, workshops and walks Echo puts on. */
  events: CommunityEvent[]
  /** Notices for the therapist who is signed in to the portal. */
  portalNotes: PortalNote[]
  retainedGroups: GroupChat[]
  reports: ReportRecord[]
  openConversationId: string | null
  /** Goes up whenever the therapist directory is refreshed from the server, so screens that list therapists redraw. */
  directoryVersion: number
  demo: { failNextPayment: boolean; showPrices: boolean; alertDevice: Device | null }
  /** The therapist portal's own data. Null until someone first signs in to it. */
  portal: PortalState | null
  /** The admin dashboard's own data. Null until a staff member first signs in. */
  admin: AdminState | null
  /** Help content, directory, plans, topics, matching rules, flags and limits. Staff edit it in the admin dashboard. */
  content: ContentState
}

/** Copies the configured limits to where the rules read them. */
export function applyLimits(): void {
  Object.assign(LIVE, state.content.limits)
  applySessionMoney(state.content.sessionMoney)
  setOpenPlans(state.content.openPlans === true)
}

export function emptyRegistration(): RegistrationDraft {
  return { fullName: '', phone: '', dob: '', email: '', consentsAcceptedAt: null, verified: false, penName: '', avatar: 'moon', languages: ['English'], topics: [] }
}

export function freshState(): DbState {
  return {
    account: null,
    signedIn: false,
    locked: false,
    reauthUntil: 0,
    reg: null,
    signupFor: null,
    otp: null,
    match: { state: 'idle' },
    conversations: [],
    directoryVersion: 0,
    posts: seedPosts(now()),
    hiddenPostIds: [],
    mutedAuthors: [],
    episodeSocial: { reactions: {}, comments: [] },
    sessions: [],
    subscription: null,
    checkout: null,
    tickets: [],
    feedback: [],
    notifications: [],
    spaces: [],
    retained: [],
    groupChats: [],
    events: seedEvents(now()),
    portalNotes: [],
    retainedGroups: [],
    reports: [],
    openConversationId: null,
    demo: { failNextPayment: false, showPrices: false, alertDevice: null },
    portal: null,
    application: null,
    admin: null,
    content: defaultContent(),
  }
}

let state: DbState = freshState()
let ready = false
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | null = null

export const getDb = (): DbState => state
export const getContent = (): ContentState => state.content
export const isReady = (): boolean => ready

function emit() {
  listeners.forEach((l) => l())
}

function persistSoon() {
  if (!ready) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { otp: _otp, checkout: _checkout, ...rest } = state
    void AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => undefined)
    void secure.set(SESSION_KEY, JSON.stringify({ signedIn: state.signedIn }))
  }, 250)
}

/** Replace part of the state. Always returns a new object so subscribers re-render. */
export function update(patch: Partial<DbState> | ((s: DbState) => Partial<DbState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  emit()
  persistSoon()
}

export function updateAccount(fn: (a: Account) => Account): void {
  if (!state.account) return
  update({ account: fn(state.account) })
}

export function useDb<T>(selector: (s: DbState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(state),
    () => selector(state),
  )
}

export async function loadDb(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DbState>
      const fresh = freshState()
      // Data saved by an older version has no entry for anything added since (languages, session rules, polls…), so every part of
      // the content that is missing is filled in from the starting values rather than left empty.
      state = { ...fresh, ...saved, content: { ...fresh.content, ...(saved.content ?? {}) }, otp: null, checkout: null }
    }
    const sec = await secure.get(SESSION_KEY)
    const signedIn = sec ? (JSON.parse(sec) as { signedIn?: boolean }).signedIn === true : false
    state = { ...state, signedIn: signedIn && state.account !== null }
    // A signed-in person with app lock on starts locked.
    if (state.signedIn && state.account?.settings.appLock) state = { ...state, locked: true }
  } catch {
    state = freshState()
  }
  applyLimits()
  ready = true
  emit()
}

export async function resetDb(): Promise<void> {
  state = freshState()
  applyLimits()
  await AsyncStorage.removeItem(KEY).catch(() => undefined)
  await secure.remove(SESSION_KEY)
  emit()
}

export type { Peer }
