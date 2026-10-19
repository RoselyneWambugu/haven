import { CONFIG } from '@/data/config'
import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { detectDistress } from '@/lib/safety'
import { getDb, resetDb, update, updateAccount } from '@/store/db'
import { showToast } from '@/store/toast'
import { CRISIS_STAFF_REPLY, STAFF_REPLIES } from './bot'
import type { Res, Ticket, TicketMessage } from './types'

const SEC = 1000
const HOUR = 3600_000
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function later(key: string, ms: number, fn: () => void) {
  const prev = timers.get(key)
  if (prev) clearTimeout(prev)
  timers.set(key, setTimeout(() => { timers.delete(key); fn() }, ms))
}

const tmsg = (from: TicketMessage['from'], text: string): TicketMessage => ({ id: uid('tm'), from, text, at: now() })

function setTicket(id: string, fn: (t: Ticket) => Ticket) {
  update((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? fn(t) : t)) }))
}

function staffReply(id: string, deptId: string, crisis: boolean) {
  later(`ticket-${id}`, crisis ? 3 * SEC : 6 * SEC, () => {
    const text = crisis ? CRISIS_STAFF_REPLY : STAFF_REPLIES[deptId] ?? STAFF_REPLIES.default
    setTicket(id, (t) => ({ ...t, status: 'replied', unread: true, messages: [...t.messages, tmsg('staff', text)] }))
    showToast('You have a reply from Echo staff.')
  })
}

// ---------------------------------------------------------------------------
// help tickets (PRD HLP-3, HLP-6, HLP-7)
// ---------------------------------------------------------------------------

export const tickets = {
  create(input: { deptId: string; subject: string; text: string }): Res<{ ticket: Ticket; crisis: boolean }> {
    const subject = input.subject.trim()
    const text = input.text.trim()
    if (!subject) return { ok: false, error: 'Add a short subject.', code: 'subject' }
    if (text.length < 10) return { ok: false, error: 'Tell us a little more so we can help.', code: 'text' }
    const risk = detectDistress(`${subject} ${text}`).level !== 'none'
    const t: Ticket = {
      id: uid('tk'), deptId: input.deptId, subject, status: 'open', unread: false,
      messages: [tmsg('me', text)], createdAt: now(), routedToCrisis: risk,
    }
    update((s) => ({ tickets: [t, ...s.tickets] }))
    staffReply(t.id, input.deptId, risk)
    return { ok: true, value: { ticket: t, crisis: risk } }
  },
  reply(id: string, text: string): Res {
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a reply first.' }
    setTicket(id, (x) => ({ ...x, status: 'open', messages: [...x.messages, tmsg('me', t)] }))
    const tk = getDb().tickets.find((x) => x.id === id)
    if (tk) staffReply(id, tk.deptId, detectDistress(t).level !== 'none')
    return { ok: true, value: undefined }
  },
  markRead(id: string): void {
    setTicket(id, (t) => (t.unread ? { ...t, unread: false } : t))
  },
  resolve(id: string): void {
    setTicket(id, (t) => ({ ...t, status: 'resolved', unread: false }))
  },
}

// ---------------------------------------------------------------------------
// account: devices, standing, appeals, data, deletion (PRD ACC-19, ACC-20, SET-3 to SET-6)
// ---------------------------------------------------------------------------

export const account = {
  signOutDevice(id: string): void {
    updateAccount((a) => ({ ...a, devices: a.devices.filter((d) => d.id !== id) }))
  },
  signOutOthers(): void {
    updateAccount((a) => ({ ...a, devices: a.devices.filter((d) => d.current) }))
  },
  /** "No, secure my account": sign out everywhere and lock. Never deletes anything (ACC-20). */
  secure(): void {
    updateAccount((a) => ({ ...a, devices: a.devices.filter((d) => d.current) }))
    update((s) => ({ demo: { ...s.demo, alertDevice: null }, signedIn: false, locked: false }))
  },
  dismissAlert(): void {
    update((s) => ({ demo: { ...s.demo, alertDevice: null } }))
  },

  appeal(noticeId: string, text: string): Res {
    const t = text.trim()
    if (t.length < 10) return { ok: false, error: 'Tell us what happened in a sentence or two.' }
    updateAccount((a) => ({ ...a, notices: a.notices.map((n) => (n.id === noticeId ? { ...n, appeal: 'pending', appealText: t } : n)) }))
    later(`appeal-${noticeId}`, 12 * SEC, () => {
      updateAccount((a) => ({
        ...a,
        notices: a.notices.map((n) => (n.id === noticeId && n.appeal === 'pending' ? { ...n, appeal: 'reduced' } : n)),
      }))
      showToast('A reviewer has looked at your appeal. See Account standing.')
    })
    return { ok: true, value: undefined }
  },

  exportData(): string {
    const a = getDb().account
    if (!a) return '{}'
    const d = getDb()
    return JSON.stringify(
      {
        exportedAt: new Date(now()).toISOString(),
        account: { public: a.public, private: a.private, consents: a.consents, settings: a.settings, createdAt: a.createdAt },
        conversations: d.conversations.map((c) => ({ id: c.id, with: c.peer?.penName ?? c.therapistId, messages: c.messages })),
        posts: d.posts.filter((p) => p.mine),
        sessions: d.sessions,
        subscription: d.subscription,
      },
      null,
      2,
    )
  },

  /** Starts the holding period and signs out. Logging in again within the period cancels it. */
  requestDeletion(_keepPosts: boolean): void {
    updateAccount((a) => ({ ...a, deletionRequestedAt: now() }))
    update({ signedIn: false, locked: false })
  },
  deletionDaysLeft(): number | null {
    const at = getDb().account?.deletionRequestedAt
    if (!at) return null
    return Math.max(0, Math.ceil((at + CONFIG.deletionHoldDays * 24 * HOUR - now()) / (24 * HOUR)))
  },
}

export { resetDb }
