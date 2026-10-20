import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { deliverAt, isEnabled, overCap, type AppNote, type NoteCategory } from '@/lib/notifications'
import { planState } from '@/lib/plan'
import { dayAndClock, dayShort } from '@/lib/time'
import { getDb, update } from '@/store/db'
import { THERAPISTS } from '@/data/seed'

const MIN = 60_000
const DAY = 24 * 60 * MIN

/** The member's in-app notifications (PRD SET-4, NTF-1, NTF-2). A mock of what push would deliver. */
export const notify = {
  /**
   * Adds a note unless the member switched its category off, or the same `key` already exists.
   * Quiet hours hold it back until 7am, and past the hourly cap it is kept but not counted as new.
   */
  push(category: NoteCategory, key: string, title: string, body: string, href: string): void {
    const db = getDb()
    const s = db.account?.settings
    if (!s || db.notifications.some((n) => n.key === key)) return
    if (!isEnabled(category, s)) return
    const at = now()
    const note: AppNote = { id: uid('n'), key, category, title, body, href, at, deliverAt: deliverAt(category, at, s), read: false, silent: overCap(db.notifications, category, at) }
    update((x) => ({ notifications: [note, ...x.notifications].slice(0, 100) }))
  },

  markRead(id: string): void {
    update((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
  },
  markAllRead(): void {
    update((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
  },
  clear(): void {
    update({ notifications: [] })
  },

  /** Creates the reminders that depend on the time: sessions, plan, and account notices. Safe to call often. */
  sync(): void {
    const db = getDb()
    if (!db.account) return
    const t = now()
    for (const x of db.sessions) {
      if (x.status !== 'booked' || x.start <= t) continue
      const who = THERAPISTS.find((th) => th.id === x.therapistId)?.name ?? 'your therapist'
      if (x.start - t <= 10 * MIN) notify.push('session', `s:${x.id}:10m`, 'Your session starts soon', `With ${who} at ${dayAndClock(x.start).split(', ')[1]}. You can join from Sessions.`, `/sessions/${x.id}`)
      else if (x.start - t <= 60 * MIN) notify.push('session', `s:${x.id}:1h`, 'Your session is in an hour', `With ${who}, ${dayAndClock(x.start)}.`, `/sessions/${x.id}`)
    }
    const sub = db.subscription
    if (sub) {
      const state = planState(sub, t)
      if (state === 'lapsed') notify.push('plan', `plan:lapsed:${sub.endsAt}`, 'Your plan has ended', 'You can still read your chats. Renew when you are ready.', '/plan')
      else if (sub.endsAt - t <= 3 * DAY) notify.push('plan', `plan:ending:${sub.endsAt}`, state === 'ending' ? 'Your plan ends soon' : 'Your plan renews soon', `Your current plan runs until ${dayShort(sub.endsAt)}.`, '/plan')
    }
    for (const n of db.account.notices) notify.push('account', `notice:${n.id}`, 'A notice about your account', n.rule, '/standing')
  },
}
