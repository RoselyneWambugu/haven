import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Account, Conversation, Device, FeedbackItem, ForumPost, GroupChat, ReportRecord, MatchState, Peer, Session, Subscription, Ticket, CheckoutItem, PortalState, AdminState, ContentState } from '@/api/types'
import { LIVE } from '@/data/config'
import { defaultContent } from '@/data/content'
import { seedPosts } from '@/data/seed'
import { now } from '@/lib/clock'
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
  /** Persisted in secure storage: whether a person is signed in on this device. */
  signedIn: boolean
  locked: boolean
  reauthUntil: number
  reg: RegistrationDraft | null
  otp: OtpState | null
  match: MatchState
  conversations: Conversation[]
  posts: ForumPost[]
  hiddenPostIds: string[]
  mutedAuthors: string[]
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
    otp: null,
    match: { state: 'idle' },
    conversations: [],
    directoryVersion: 0,
    posts: seedPosts(now()),
    hiddenPostIds: [],
    mutedAuthors: [],
    sessions: [],
    subscription: null,
    checkout: null,
    tickets: [],
    feedback: [],
    notifications: [],
    spaces: [],
    retained: [],
    groupChats: [],
    retainedGroups: [],
    reports: [],
    openConversationId: null,
    demo: { failNextPayment: false, showPrices: false, alertDevice: null },
    portal: null,
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
      state = { ...freshState(), ...saved, otp: null, checkout: null }
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
