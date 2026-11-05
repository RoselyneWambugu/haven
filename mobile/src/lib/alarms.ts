import type { GroupChat, PortalSession, Session, Settings } from '@/api/types'

const MIN = 60_000

/** How long before a start the two alarms go off: an hour before (a heads-up) and ten minutes before (time to get ready and join). */
export const ALARM_LEADS = [60 * MIN, 10 * MIN] as const
/** The loud in-app alarm opens this long before the start, and stays until it is dismissed or the session has been running this long. */
export const ALARM_WINDOW = 10 * MIN
export const ALARM_GRACE = 10 * MIN

/** Something that starts at a time and that the person should not miss: a booked session, a group chat they signed up for, or a therapist's session. */
export interface AlarmItem {
  id: string
  kind: 'session' | 'group' | 'client'
  start: number
  /** Who it is with, or what it is about. Shown only when the lock screen is allowed to show text. */
  who: string
  /** Where the alarm takes the person. */
  route: string
}

export interface PlannedAlarm {
  /** A stable id, so scheduling again replaces rather than duplicates. */
  id: string
  at: number
  title: string
  body: string
  route: string
}

type Names = (therapistId: string) => string | undefined

/** Everything with a start time that is still ahead of `t`, soonest first. */
export function alarmItems(src: { sessions: Session[]; groupChats: GroupChat[]; portalSessions?: PortalSession[]; therapistName: Names }, t: number): AlarmItem[] {
  const out: AlarmItem[] = []
  for (const s of src.sessions) {
    if (s.status === 'booked' && s.end > t) out.push({ id: `s:${s.id}`, kind: 'session', start: s.start, who: src.therapistName(s.therapistId) ?? 'your therapist', route: `/sessions/${s.id}` })
  }
  for (const g of src.groupChats) {
    if (g.registered && g.startsAt + g.durationMin * MIN > t) out.push({ id: `g:${g.id}`, kind: 'group', start: g.startsAt, who: g.topic, route: `/group-chats/${g.id}` })
  }
  for (const p of src.portalSessions ?? []) {
    if (p.status === 'booked' && p.end > t) out.push({ id: `p:${p.id}`, kind: 'client', start: p.start, who: p.clientName, route: `/portal/session/${p.id}` })
  }
  return out.sort((a, b) => a.start - b.start)
}

const words = (leadMin: number): string => (leadMin >= 60 ? `${leadMin / 60 === 1 ? 'an hour' : `${leadMin / 60} hours`}` : `${leadMin} minutes`)

/**
 * The alarms to hand to the phone: one per lead time per item, for those still in the future. The phone fires them even when Echo is closed.
 * When the member hides text on the lock screen, the alarm says only that something is starting, not who it is with.
 */
export function planAlarms(items: AlarmItem[], t: number, settings: Pick<Settings, 'hideTextOnLockScreen'>, horizonMs = 14 * 24 * 60 * MIN): PlannedAlarm[] {
  const out: PlannedAlarm[] = []
  for (const it of items) {
    for (const lead of ALARM_LEADS) {
      const at = it.start - lead
      if (at <= t || at > t + horizonMs) continue
      const leadMin = lead / MIN
      const what = it.kind === 'group' ? 'Your group chat' : it.kind === 'client' ? 'Your session' : 'Your session'
      const title = lead <= 10 * MIN ? 'Time to get ready' : 'Coming up in an hour'
      const body = settings.hideTextOnLockScreen
        ? `Something is starting in ${words(leadMin)}. Open Echo.`
        : `${what}${it.kind === 'session' ? ` with ${it.who}` : it.kind === 'client' ? ` with ${it.who}` : `, ${it.who},`} starts in ${words(leadMin)}.`
      out.push({ id: `alarm:${it.id}:${leadMin}`, at, title, body, route: it.route })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The item whose loud alarm should be showing right now, if any: it starts within ten minutes, or began less than ten minutes ago. */
export function dueAlarm(items: AlarmItem[], t: number, dismissed: ReadonlySet<string>): AlarmItem | null {
  for (const it of items) {
    if (dismissed.has(it.id)) continue
    if (it.start - t <= ALARM_WINDOW && t - it.start <= ALARM_GRACE) return it
  }
  return null
}

/** "starts in 8 minutes", "starts in under a minute", "started 2 minutes ago". */
export function startsIn(start: number, t: number): string {
  const diff = start - t
  if (diff > MIN) return `starts in ${Math.ceil(diff / MIN)} minutes`
  if (diff > 0) return 'starts in under a minute'
  const ago = Math.floor((t - start) / MIN)
  return ago <= 0 ? 'is starting now' : `started ${ago} minute${ago === 1 ? '' : 's'} ago`
}
