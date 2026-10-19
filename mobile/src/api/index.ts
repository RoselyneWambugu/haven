/**
 * The app talks to the backend only through this object. Today it is backed by
 * an in-memory mock that is saved on the device. To go live, give each group
 * the same methods and point them at the real service.
 */
import { auth } from './auth'
import { billing, sessions } from './care'
import { demo } from './demo'
import { admin } from './admin'
import { applyPortalToDirectory, portal } from './portal'
import { chat, forum, match, report } from './social'
import { account, tickets } from './support'

export const api = { auth, match, chat, report, forum, billing, sessions, tickets, account, demo, portal, admin }

/** Restarts timers for anything that was in progress when the app last closed. */
export function resumeBackground(): void {
  match.resume()
  forum.resume()
  applyPortalToDirectory()
}

export * from './types'
