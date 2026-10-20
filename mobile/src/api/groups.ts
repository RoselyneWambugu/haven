import { CLOSING, GROUP_TEMPLATES, SCRIPTS } from '@/data/groupChats'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { canRegister, deletesAt, linesDue, status } from '@/lib/groupChat'
import { uid } from '@/lib/id'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { startOfEatDay } from '@/lib/time'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { report } from './social'
import type { GroupChat, GroupMessage, ReportReason, Res } from './types'

const HOUR = 3600_000
const DAY = 24 * HOUR
const MIN = 60_000
const MAX_TEXT = 500

const setGroup = (id: string, fn: (g: GroupChat) => GroupChat) => update((s) => ({ groupChats: s.groupChats.map((g) => (g.id === id ? fn(g) : g)) }))

function dateKey(ms: number): string {
  const d = new Date(ms + 3 * HOUR)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Timed, facilitated group chats on one topic (PRD scope change, v0.29). Members register, the room opens at the set time. */
export const groups = {
  /** Makes sure each topic has an upcoming session, so there is always something to sign up for. Safe to call often. */
  ensure(): void {
    const db = getDb()
    const t = now()
    const add: GroupChat[] = []
    for (const tpl of GROUP_TEMPLATES) {
      const key = `gc-${tpl.key}-`
      if (db.groupChats.some((g) => g.id.startsWith(key) && g.startsAt > t)) continue
      let start = startOfEatDay(t) + tpl.dayOffset * DAY + tpl.hour * HOUR
      while (db.groupChats.some((g) => g.id === `${key}${dateKey(start)}`) || add.some((g) => g.id === `${key}${dateKey(start)}`)) start += 7 * DAY
      add.push({
        id: `${key}${dateKey(start)}`, topic: tpl.topic, blurb: tpl.blurb, facilitatorId: THERAPISTS[tpl.facilitator].id, startsAt: start, durationMin: tpl.durationMin,
        capacity: tpl.capacity, takenOthers: tpl.takenOthers, registered: false, messages: [], posted: 0,
      })
    }
    if (add.length) update((s) => ({ groupChats: [...s.groupChats, ...add].sort((a, b) => a.startsAt - b.startsAt) }))
  },

  register(id: string): Res {
    const db = getDb()
    const a = db.account
    const g = db.groupChats.find((x) => x.id === id)
    if (!a || !g) return { ok: false, error: 'That group chat isn’t here.' }
    if (a.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    if (g.registered) return { ok: true, value: undefined }
    if (!canRegister(g, now())) return { ok: false, error: status(g, now()) === 'open' || status(g, now()) === 'ended' ? 'This group chat has already started.' : 'This group chat is full.', code: 'closed' }
    setGroup(id, (x) => ({ ...x, registered: true }))
    showToast('You’re signed up. We’ll remind you.')
    return { ok: true, value: undefined }
  },

  unregister(id: string): void {
    setGroup(id, (x) => ({ ...x, registered: false }))
  },

  /** Writes to an open group chat. The same content rules apply as in every chat. */
  send(id: string, text: string): Res {
    const db = getDb()
    const a = db.account
    const g = db.groupChats.find((x) => x.id === id)
    if (!a || !g) return { ok: false, error: 'That group chat isn’t here.' }
    if (!g.registered) return { ok: false, error: 'Sign up to take part.', code: 'not-registered' }
    if (a.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    if (status(g, now()) !== 'open') return { ok: false, error: status(g, now()) === 'ended' ? 'This group chat has ended.' : 'It hasn’t started yet.', code: 'not-open' }
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a message first.', code: 'empty' }
    if (t.length > MAX_TEXT) return { ok: false, error: `Please keep it under ${MAX_TEXT} characters.`, code: 'long' }
    const check = detectBlockedContent(t)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const m: GroupMessage = { id: uid('gm'), name: a.public.penName, avatar: a.public.avatar, text: t, at: now(), mine: true }
    setGroup(id, (x) => ({ ...x, messages: [...x.messages, m] }))
    return { ok: true, value: undefined }
  },

  /** Posts what the room says as time passes, adds the closing note, and deletes old rooms. Safe to call often. */
  tick(): void {
    const db = getDb()
    const t = now()
    const reported = new Set(db.reports.flatMap((r) => (r.groupChatId ? [r.groupChatId] : [])))
    const keep: GroupChat[] = []
    const retain: GroupChat[] = []
    let changed = false
    for (const g0 of db.groupChats) {
      if (t >= deletesAt(g0)) {
        changed = true
        if (reported.has(g0.id)) retain.push(g0)
        continue
      }
      let g = g0
      const key = g.id.split('-')[1]
      const script = SCRIPTS[key] ?? []
      const th = THERAPISTS.find((x) => x.id === g.facilitatorId)
      const due = linesDue(script, g.posted, g, t)
      if (due.length) {
        const msgs: GroupMessage[] = due.map(({ line, at }, i) => ({ id: `${g.id}-s${g.posted + i}`, name: line.facilitator ? th?.name ?? 'Facilitator' : line.name, avatar: line.avatar, text: line.text, at, facilitator: line.facilitator }))
        g = { ...g, messages: [...g.messages, ...msgs].sort((a, b) => a.at - b.at), posted: g.posted + due.length }
      }
      if (status(g, t) === 'ended' && !g.closed) {
        const end = g.startsAt + g.durationMin * MIN
        g = { ...g, closed: true, messages: [...g.messages, { id: `${g.id}-end`, name: 'Echo', avatar: 'leaf', text: CLOSING[key] ?? 'This group chat has ended. It will be deleted in 24 hours.', at: end, system: true }] }
      }
      if (g !== g0) changed = true
      keep.push(g)
    }
    if (!changed) return
    update((s) => ({ groupChats: keep, retainedGroups: [...s.retainedGroups, ...retain.filter((r) => !s.retainedGroups.some((x) => x.id === r.id))] }))
  },

  /** Report a message in a group chat. The conversation so far is kept with the report. */
  report(id: string, messageId: string, reason: ReportReason): void {
    const g = getDb().groupChats.find((x) => x.id === id)
    const m = g?.messages.find((x) => x.id === messageId)
    if (!g || !m || m.mine || m.system) return
    report.submit({ target: 'message', targetId: messageId, reason, note: '', groupChatId: id })
  },
}
