/**
 * The app talks to the backend only through this object. Today it is backed by
 * an in-memory mock that is saved on the device. To go live, give each group
 * the same methods and point them at the real service.
 */
import { auth as mockAuth } from './auth'
import { REMOTE } from '@/backend/client'
import { remoteAccountActions, remoteAuth } from '@/backend/remoteAuth'
import { remoteChat, remoteMatch, remoteReport } from '@/backend/remoteChat'
import { remoteBilling } from '@/backend/remoteBilling'
import { appealNotice } from '@/backend/remoteNotices'
import { remoteAdmin, remoteTeam } from '@/backend/remoteAdmin'
import { remoteSessions } from '@/backend/remoteTherapists'
import { remotePortal } from '@/backend/remotePortal'
import { remoteForum, remoteSpaces } from '@/backend/remoteForum'
import { billing as mockBilling, sessions as mockSessions } from './care'
import { demo } from './demo'
import { groups } from './groups'
import { notify } from './notify'
import { feedback } from './feedback'
import { admin as mockAdmin } from './admin'
import { config, resources, suggestService } from './content'
import { applyPortalToDirectory, applyStandingToDirectory, portal as mockPortal } from './portal'
import { chat as mockChat, forum as mockForum, match as mockMatch, report as mockReport } from './social'
import { account as mockAccount, tickets } from './support'
import { spaces as mockSpaces } from './spaces'
import { team as mockTeam } from './team'
import { therapistAppeals } from './therapistAppeals'

/**
 * The real backend answers later than the mock, so screens `await` these calls. The type stays the mock's
 * because an `await` of an immediate answer is harmless, and the tests read the mock's answers directly.
 */
const auth = (REMOTE ? remoteAuth : mockAuth) as typeof mockAuth

const match = (REMOTE ? remoteMatch : mockMatch) as typeof mockMatch
const chat = (REMOTE ? remoteChat : mockChat) as typeof mockChat
const portal = (REMOTE ? remotePortal : mockPortal) as typeof mockPortal
const sessions = (REMOTE ? remoteSessions : mockSessions) as typeof mockSessions
const billing = (REMOTE ? remoteBilling : mockBilling) as typeof mockBilling
const forum = (REMOTE ? remoteForum : mockForum) as typeof mockForum
const spaces = (REMOTE ? remoteSpaces : mockSpaces) as typeof mockSpaces
const team = (REMOTE ? remoteTeam : mockTeam) as typeof mockTeam
const admin = (REMOTE ? remoteAdmin : mockAdmin) as typeof mockAdmin
const report = (REMOTE ? remoteReport : mockReport) as typeof mockReport

const account: typeof mockAccount = REMOTE
  ? {
      ...mockAccount,
      signOutDevice(id) {
        mockAccount.signOutDevice(id)
        remoteAccountActions.revokeDevice(id)
      },
      appeal: appealNotice as unknown as typeof mockAccount.appeal,
      requestDeletion(keepPosts) {
        mockAccount.requestDeletion(keepPosts)
        remoteAccountActions.requestDeletion()
      },
    }
  : mockAccount

export const api = { auth, match, chat, report, forum, billing, sessions, tickets, account, demo, portal, admin, resources, config, suggestService, team, feedback, notify, therapistAppeals, spaces, groups }

/** Restarts timers for anything that was in progress when the app last closed. */
export function resumeBackground(): void {
  match.resume()
  forum.resume()
  applyPortalToDirectory()
  applyStandingToDirectory()
  spaces.ensureSeeds()
  chat.sweep()
  groups.ensure()
  groups.tick()
}

export * from './types'
