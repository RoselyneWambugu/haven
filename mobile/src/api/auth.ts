import { CONFIG } from '@/data/config'
import { PEERS, THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { MIN_AGE, ageBand, ageOn, normaliseKenyanPhone, parseDob } from '@/lib/identity'
import { uid } from '@/lib/id'
import { validatePenName } from '@/lib/safety'
import { emptyRegistration, getDb, update, updateAccount, type RegistrationDraft } from '@/store/db'
import { showToast } from '@/store/toast'
import type { Account, AvatarKind, Device, Res, Settings } from './types'

const HOUR = 3600_000
const MIN = 60_000

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  notifyMessages: true,
  notifySessions: true,
  notifyForum: true,
  notifyPlan: true,
  quietHours: true,
  hideTextOnLockScreen: true,
  neutralNotifications: true,
  appLock: false,
  lockAfterSeconds: 60,
  hidePenNameOnLock: true,
  quickExit: true,
  disappearingDefault: 'ask',
}

function currentDevice(platform: string): Device {
  return {
    id: uid('dev'),
    name: platform === 'web' ? 'This browser (demo)' : 'This phone',
    kind: platform === 'web' ? 'web' : 'phone',
    lastActiveAt: now(),
    approxPlace: 'Nairobi',
    current: true,
  }
}

function otherDevices(): Device[] {
  return [
    { id: uid('dev'), name: 'Tecno Spark 10', kind: 'phone', lastActiveAt: now() - 2 * 24 * HOUR, approxPlace: 'near Kisumu', current: false },
    { id: uid('dev'), name: 'Web browser', kind: 'web', lastActiveAt: now() - 21 * 24 * HOUR, approxPlace: 'near Nairobi', current: false },
  ]
}

function code(): string {
  let c = ''
  for (let i = 0; i < CONFIG.otpLength; i++) c += Math.floor(Math.random() * 10)
  // Avoid obviously guessable codes.
  return /^(\d)\1+$/.test(c) ? '482193'.slice(0, CONFIG.otpLength) : c
}

export const auth = {
  /** Step 1 of registration: details. Under-18s are stopped and nothing is kept (ACC-9). */
  submitDetails(input: { fullName: string; phone: string; dob: string; email: string }): Res<{ phone: string }> {
    const fullName = input.fullName.trim()
    if (fullName.length < 2) return { ok: false, error: 'Enter your full name.', code: 'name' }
    const phone = normaliseKenyanPhone(input.phone)
    if (!phone) return { ok: false, error: 'Enter a Kenyan mobile number, like 0712 345 678.', code: 'phone' }
    const dob = parseDob(input.dob)
    if (!dob) return { ok: false, error: 'Enter your date of birth as day / month / year.', code: 'dob' }
    const age = ageOn(dob, new Date(now()))
    if (age < MIN_AGE) {
      update({ reg: null, otp: null })
      return { ok: false, error: 'Echo is for people 18 and over.', code: 'under-18' }
    }
    const email = input.email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That email doesn’t look right. You can leave it blank.', code: 'email' }
    const prev = getDb().reg
    update({
      reg: { ...(prev ?? emptyRegistration()), fullName, phone, dob: dob.toISOString(), email, verified: false },
    })
    return { ok: true, value: { phone } }
  },

  acceptConsents(): void {
    const reg = getDb().reg ?? emptyRegistration()
    update({ reg: { ...reg, consentsAcceptedAt: now() } })
  },

  /** Sends a one-time code. In this demo the code is returned so the screen can show it. */
  requestOtp(purpose: 'register' | 'login' | 'reauth', phoneInput?: string): Res<{ demoCode: string; phone: string }> {
    const db = getDb()
    let phone: string | null = null
    if (purpose === 'register') phone = db.reg?.phone ?? null
    else if (purpose === 'reauth') phone = db.account?.private.phone ?? null
    else phone = normaliseKenyanPhone(phoneInput ?? '')
    if (!phone) return { ok: false, error: 'Enter a Kenyan mobile number, like 0712 345 678.', code: 'phone' }
    const prev = db.otp
    const lockedUntil = prev && prev.phone === phone && prev.lockedUntil && prev.lockedUntil > now() ? prev.lockedUntil : null
    if (lockedUntil) {
      return { ok: false, error: `Too many tries. You can try again in ${Math.ceil((lockedUntil - now()) / MIN)} minutes.`, code: 'locked' }
    }
    const c = code()
    update({ otp: { phone, code: c, purpose, expiresAt: now() + 10 * MIN, attempts: 0, lockedUntil: null } })
    return { ok: true, value: { demoCode: c, phone } }
  },

  verifyOtp(input: string): Res<{ next: 'create-profile' | 'trust-device' | 'reauth-ok' | 'no-account' | 'already-registered' }> {
    const db = getDb()
    const otp = db.otp
    if (!otp) return { ok: false, error: 'Ask for a new code.', code: 'none' }
    if (otp.lockedUntil && otp.lockedUntil > now()) {
      return { ok: false, error: `Too many tries. You can try again in ${Math.ceil((otp.lockedUntil - now()) / MIN)} minutes.`, code: 'locked' }
    }
    if (otp.expiresAt < now()) return { ok: false, error: 'That code has expired. Ask for a new one.', code: 'expired' }
    if (input.trim() !== otp.code) {
      const attempts = otp.attempts + 1
      if (attempts >= CONFIG.otpMaxAttempts) {
        update({ otp: { ...otp, attempts, lockedUntil: now() + CONFIG.otpLockMinutes * MIN } })
        return { ok: false, error: `Too many tries. You can try again in ${CONFIG.otpLockMinutes} minutes.`, code: 'locked' }
      }
      update({ otp: { ...otp, attempts } })
      const left = CONFIG.otpMaxAttempts - attempts
      return { ok: false, error: `That code doesn’t match. ${left} ${left === 1 ? 'try' : 'tries'} left.`, code: 'wrong' }
    }
    update({ otp: null })
    if (otp.purpose === 'reauth') {
      update({ reauthUntil: now() + 5 * MIN })
      return { ok: true, value: { next: 'reauth-ok' } }
    }
    if (otp.purpose === 'register') {
      if (db.account && db.account.private.phone === otp.phone) return { ok: true, value: { next: 'already-registered' } }
      update((s) => ({ reg: { ...(s.reg ?? emptyRegistration()), verified: true } }))
      return { ok: true, value: { next: 'create-profile' } }
    }
    // login
    if (!db.account || db.account.private.phone !== otp.phone) return { ok: true, value: { next: 'no-account' } }
    update({ signedIn: true, locked: false })
    if (db.account.deletionRequestedAt) {
      updateAccount((a) => ({ ...a, deletionRequestedAt: null }))
      showToast('Welcome back. Your account deletion was cancelled.')
    }
    return { ok: true, value: { next: 'trust-device' } }
  },

  checkPenName(name: string): Res {
    const v = validatePenName(name)
    if (!v.ok) return { ok: false, error: v.message, code: v.problem }
    const lower = name.toLowerCase()
    const taken =
      PEERS.some((p) => p.penName.toLowerCase() === lower && p.id !== 'p-quiet') ||
      THERAPISTS.some((t) => t.name.toLowerCase().replace(/[^a-z]/g, '') === lower) ||
      (getDb().account?.public.penName.toLowerCase() === lower)
    if (taken) return { ok: false, error: 'Someone already has that name. Try another.', code: 'taken' }
    return { ok: true, value: undefined }
  },

  saveProfileDraft(patch: Partial<Pick<RegistrationDraft, 'penName' | 'avatar' | 'languages' | 'topics'>>): void {
    const reg = getDb().reg ?? emptyRegistration()
    update({ reg: { ...reg, ...patch } })
  },

  completeRegistration(platform: string): Res {
    const reg = getDb().reg
    if (!reg || !reg.verified || !reg.consentsAcceptedAt) return { ok: false, error: 'Please start again.', code: 'incomplete' }
    const dob = new Date(reg.dob)
    const band = ageBand(ageOn(dob, new Date(now())))
    if (!band) return { ok: false, error: 'Echo is for people 18 and over.', code: 'under-18' }
    const name = this.checkPenName(reg.penName)
    if (!name.ok) return name
    if (!reg.languages.length) return { ok: false, error: 'Choose at least one language.', code: 'languages' }
    const account: Account = {
      id: uid('acc'),
      public: { penName: reg.penName, avatar: reg.avatar, languages: reg.languages, ageBand: band, topics: reg.topics, openToChats: true, penNameChangedAt: null },
      private: { fullName: reg.fullName, phone: reg.phone, email: reg.email, dob: reg.dob, idVerified: false },
      consents: { terms: true, privacy: true, guidelines: true, moderation: true, version: '2026-10', at: reg.consentsAcceptedAt },
      createdAt: now(),
      settings: { ...DEFAULT_SETTINGS },
      notices: [],
      standing: 'good',
      devices: [currentDevice(platform), ...otherDevices()],
      trustedDevice: true,
      sharedDevice: false,
      blocked: [],
      deletionRequestedAt: null,
      mood: null,
      hasPostedBefore: false,
    }
    update({ account, signedIn: true, locked: false, reg: null, otp: null })
    return { ok: true, value: undefined }
  },

  /** After login on a "new" device: own phone keeps the session and turns on app lock; shared phone expires after 24 hours. */
  trustDevice(own: boolean, platform: string): void {
    updateAccount((a) => ({
      ...a,
      trustedDevice: own,
      sharedDevice: !own,
      settings: { ...a.settings, appLock: own },
      devices: a.devices.some((d) => d.current) ? a.devices : [currentDevice(platform), ...a.devices],
    }))
  },

  signOut(): void {
    update({ signedIn: false, locked: false, openConversationId: null })
  },

  lock(): void {
    const a = getDb().account
    if (getDb().signedIn && a?.settings.appLock) update({ locked: true })
  },

  unlock(): void {
    update({ locked: false })
  },

  /** Pretends to be a person who forgot to leave. Clears everything from this device. Used by quick exit. */
  quickExit(): void {
    update({ locked: true })
  },

  requestHold(): boolean {
    return !!getDb().account?.deletionRequestedAt
  },

  isReauthed(): boolean {
    return getDb().reauthUntil > now()
  },

  changePenName(name: string): Res {
    const a = getDb().account
    if (!a) return { ok: false, error: 'Sign in first.' }
    if (a.public.penNameChangedAt && now() - a.public.penNameChangedAt < CONFIG.penNameChangeDays * 24 * HOUR) {
      const days = Math.ceil((CONFIG.penNameChangeDays * 24 * HOUR - (now() - a.public.penNameChangedAt)) / (24 * HOUR))
      return { ok: false, error: `You can change your pen name again in ${days} days.`, code: 'limit' }
    }
    if (name === a.public.penName) return { ok: true, value: undefined }
    const check = this.checkPenName(name)
    if (!check.ok) return check
    updateAccount((x) => ({ ...x, public: { ...x.public, penName: name, penNameChangedAt: now() } }))
    return { ok: true, value: undefined }
  },

  setAvatar(avatar: AvatarKind): void {
    updateAccount((a) => ({ ...a, public: { ...a.public, avatar } }))
  },

  setLanguages(languages: string[]): Res {
    if (!languages.length) return { ok: false, error: 'Choose at least one language.' }
    updateAccount((a) => ({ ...a, public: { ...a.public, languages } }))
    return { ok: true, value: undefined }
  },

  setTopics(topics: string[]): void {
    updateAccount((a) => ({ ...a, public: { ...a.public, topics } }))
  },

  setSettings(patch: Partial<Settings>): void {
    updateAccount((a) => ({ ...a, settings: { ...a.settings, ...patch } }))
  },

  setMood(value: 1 | 2 | 3 | 4 | 5): void {
    updateAccount((a) => ({ ...a, mood: { value, at: now() } }))
  },
}
