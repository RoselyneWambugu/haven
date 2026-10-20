import { CLOSING, GENERIC_CLOSING, GENERIC_SCRIPT, GROUP_TEMPLATES, SCRIPTS } from '@/data/groupChats'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { canRegister, deletesAt, isRemoved, linesDue, participants, status, validateNewGroup, type NewGroupInput } from '@/lib/groupChat'
import { canManageGroups, canModerateGroups } from '@/lib/admin'
import { uid } from '@/lib/id'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { startOfEatDay } from '@/lib/time'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { requirePlan } from './access'
import { log, me } from './admin'
import { notify } from './notify'
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
    const gate = requirePlan('Group chats')
    if (gate) return gate
    if (g.cancelled) return { ok: false, error: 'This group chat was cancelled.', code: 'cancelled' }
    if (isRemoved(g, a.public.penName)) return { ok: false, error: 'You were removed from this group chat.', code: 'removed' }
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
    if (isRemoved(g, a.public.penName)) return { ok: false, error: 'You were removed from this group chat by a moderator.', code: 'removed' }
    const gate = requirePlan('Group chats')
    if (gate) return gate
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
      const script = SCRIPTS[key] ?? GENERIC_SCRIPT
      const th = THERAPISTS.find((x) => x.id === g.facilitatorId)
      const due = linesDue(script, g.posted, g, t)
      if (due.length) {
        const msgs: GroupMessage[] = due.filter(({ line }) => line.facilitator || !isRemoved(g, line.name)).map(({ line, at }, i) => ({ id: `${g.id}-s${g.posted + i}`, name: line.facilitator ? th?.name ?? 'Facilitator' : line.name, avatar: line.avatar, text: line.text, at, facilitator: line.facilitator }))
        g = { ...g, messages: [...g.messages, ...msgs].sort((a, b) => a.at - b.at), posted: g.posted + due.length }
      }
      if (status(g, t) === 'ended' && !g.closed) {
        const end = g.startsAt + g.durationMin * MIN
        g = { ...g, closed: true, messages: [...g.messages, { id: `${g.id}-end`, name: 'Echo', avatar: 'leaf', text: CLOSING[key] ?? GENERIC_CLOSING, at: end, system: true }] }
      }
      if (g !== g0) changed = true
      keep.push(g)
    }
    if (!changed) return
    update((s) => ({ groupChats: keep, retainedGroups: [...s.retainedGroups, ...retain.filter((r) => !s.retainedGroups.some((x) => x.id === r.id))] }))
  },

  /** Staff schedule a group chat. Clinical reviewers and Admins only, and it is written to the audit log. */
  schedule(input: NewGroupInput): Res<{ id: string }> {
    const a = getDb().admin
    if (!a || !a.signedIn || !canManageGroups(a.role)) return { ok: false, error: 'Only clinical reviewers and Admins schedule group chats.', code: 'role' }
    const th = THERAPISTS.find((x) => x.id === input.facilitatorId)
    const ok = !!th && !th.suspended && !a.therapistStanding?.[input.facilitatorId]
    const err = validateNewGroup(input, now(), getDb().groupChats, ok)
    if (err) return { ok: false, error: err, code: 'invalid' }
    const id = `gc-custom-${uid('g')}`
    const g: GroupChat = { id, topic: input.topic.trim(), blurb: input.blurb.trim(), facilitatorId: input.facilitatorId, startsAt: input.startsAt, durationMin: input.durationMin, capacity: input.capacity, takenOthers: 0, registered: false, messages: [], posted: 0, createdBy: me().name }
    update((s) => ({ groupChats: [...s.groupChats, g].sort((x, y) => x.startsAt - y.startsAt) }))
    log('Scheduled group chat', g.topic, `${th?.name}, ${input.durationMin} min`)
    return { ok: true, value: { id } }
  },

  /** Cancels a group chat before it starts. Anyone signed up is told. */
  cancel(id: string, reason: string): Res {
    const a = getDb().admin
    if (!a || !a.signedIn || !canManageGroups(a.role)) return { ok: false, error: 'Only clinical reviewers and Admins cancel group chats.', code: 'role' }
    const g = getDb().groupChats.find((x) => x.id === id)
    if (!g) return { ok: false, error: 'That group chat isn’t here.' }
    const st = status(g, now())
    if (st === 'cancelled') return { ok: false, error: 'It is already cancelled.' }
    if (st === 'open' || st === 'ended') return { ok: false, error: 'It has already started, so it can’t be cancelled.', code: 'started' }
    if (reason.trim().length < 5) return { ok: false, error: 'A reason is required.', code: 'reason' }
    const { name } = me()
    setGroup(id, (x) => ({ ...x, cancelled: { reason: reason.trim(), by: name, at: now() } }))
    if (g.registered) notify.push('session', `g:${id}:cancelled`, 'Your group chat was cancelled', `${g.topic} won’t go ahead. We’re sorry. There will be another soon.`, `/group-chats/${id}`)
    log('Cancelled group chat', g.topic, reason.trim())
    return { ok: true, value: undefined }
  },

  /**
   * Removes a person from a group chat that is open or about to open: moderators, clinical reviewers and Admins, with a reason, logged.
   * Their messages are hidden, they cannot write or sign up again, and they are told. This is not a sanction; use the usual process for that.
   */
  removeParticipant(id: string, name: string, reason: string): Res {
    const a = getDb().admin
    if (!a || !a.signedIn || !canModerateGroups(a.role)) return { ok: false, error: 'Your role can’t remove people from a group chat.', code: 'role' }
    const g = getDb().groupChats.find((x) => x.id === id)
    if (!g) return { ok: false, error: 'That group chat isn’t here.' }
    const st = status(g, now())
    if (st !== 'open' && st !== 'lobby') return { ok: false, error: 'You can remove someone only while the chat is open.', code: 'not-open' }
    const memberName = getDb().account?.public.penName
    const target = participants(g, memberName).find((p) => p.name === name)
    if (!target) return { ok: false, error: 'That person isn’t in this chat.', code: 'not-in-chat' }
    if (target.removed) return { ok: false, error: 'They are already removed.' }
    if (reason.trim().length < 5) return { ok: false, error: 'A reason is required.', code: 'reason' }
    const { name: by } = me()
    setGroup(id, (x) => ({ ...x, removed: [...(x.removed ?? []), { name, reason: reason.trim(), by, at: now() }] }))
    if (target.you) notify.push('safety', `g:${id}:removed`, 'You were removed from a group chat', `A moderator removed you from “${g.topic}” because it broke the group’s rules. You can still use the rest of Echo.`, `/group-chats/${id}`)
    log('Removed person from group chat', `${g.topic}: ${name}`, reason.trim())
    return { ok: true, value: undefined }
  },

  /** Report a message in a group chat. The conversation so far is kept with the report. */
  report(id: string, messageId: string, reason: ReportReason): void {
    const g = getDb().groupChats.find((x) => x.id === id)
    const m = g?.messages.find((x) => x.id === messageId)
    if (!g || !m || m.mine || m.system) return
    report.submit({ target: 'message', targetId: messageId, reason, note: '', groupChatId: id })
  },
}
