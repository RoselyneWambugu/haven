import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Account, Conversation, Device, ForumPost, MatchState, Peer, Session, Subscription, Ticket, CheckoutItem } from '@/api/types'
import { seedPosts } from '@/data/seed'
import { now } from '@/lib/clock'
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
  reports: { id: string; target: string; targetId: string; reason: string; note: string; at: number }[]
  openConversationId: string | null
  demo: { failNextPayment: boolean; showPrices: boolean; alertDevice: Device | null }
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
    posts: seedPosts(now()),
    hiddenPostIds: [],
    mutedAuthors: [],
    sessions: [],
    subscription: null,
    checkout: null,
    tickets: [],
    reports: [],
    openConversationId: null,
    demo: { failNextPayment: false, showPrices: false, alertDevice: null },
  }
}

let state: DbState = freshState()
let ready = false
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | null = null

export const getDb = (): DbState => state
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
  ready = true
  emit()
}

export async function resetDb(): Promise<void> {
  state = freshState()
  await AsyncStorage.removeItem(KEY).catch(() => undefined)
  await secure.remove(SESSION_KEY)
  emit()
}

export type { Peer }
