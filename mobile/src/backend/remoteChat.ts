import { chat as mockChat, match as mockMatch, report as mockReport } from '@/api/social'
import { notify } from '@/api/notify'
import type { Conversation, Message, Peer, ReportReason, ReportTarget, Res } from '@/api/types'
import { now } from '@/lib/clock'
import type { AgeBand } from '@/lib/identity'
import { canChat, planState } from '@/lib/plan'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { getDb, update, updateAccount } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'

/** What the server sends for a peer or a blocked person. */
interface RemotePeer { id: string; pen_name: string; avatar: Peer['avatar']; languages: string[]; age_band: AgeBand }

interface RemoteConversation {
  id: string
  kind: 'peer' | 'therapist'
  peer: RemotePeer | null
  created_at: string
  expires_at: string
  ended: boolean
  muted: boolean
  archived: boolean
  disappearing: Conversation['disappearing']
  unread: number
  last_at: string
  messages: { id: string; from: Message['from']; text: string; at: string }[]
}

interface MatchReply { ok: true; state: 'idle' | 'searching' | 'found'; conversation_id: string | null }
type Reply = { ok: true; [k: string]: unknown } | { ok: false; code: string; error: string }

const ms = (iso: string): number => new Date(iso).getTime()
const POLL_MS = 3000
const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'

async function rpc(name: string, args?: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase().rpc(name, args)
  if (error) return { ok: false, code: 'network', error: OFFLINE }
  return (data ?? { ok: true }) as Reply
}

const toPeer = (p: RemotePeer): Peer => ({ id: p.id, penName: p.pen_name, avatar: p.avatar, languages: p.languages, ageBand: p.age_band })

function toConversation(c: RemoteConversation, prev?: Conversation): Conversation {
  return {
    id: c.id,
    kind: c.kind,
    peer: c.peer ? toPeer(c.peer) : null,
    therapistId: null,
    messages: c.messages.map((m) => ({ id: m.id, from: m.from, text: m.text, at: ms(m.at) })),
    muted: c.muted,
    archived: c.archived,
    ended: c.ended,
    disappearing: c.disappearing,
    unread: c.unread,
    createdAt: ms(c.created_at),
    lastAt: ms(c.last_at),
    heard: prev?.heard,
    warned: prev?.warned,
  }
}

let syncing: Promise<void> | null = null

/** Brings the chats, the people you've blocked and the matching state in line with the server, and tells you about new messages. */
export function syncChats(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    const { data, error } = await supabase().rpc('my_chats')
    if (error || !data || (data as { ok?: boolean }).ok !== true || !Array.isArray((data as { conversations?: unknown }).conversations)) return
    const d = data as { conversations: RemoteConversation[]; blocked: RemotePeer[]; match: MatchReply | null }
    const db = getDb()
    const before = new Map(db.conversations.map((c) => [c.id, c]))
    const next = d.conversations.map((c) => toConversation(c, before.get(c.id)))
    for (const c of next) {
      const prev = before.get(c.id)
      if (!prev || prev.muted || getDb().openConversationId === c.id) continue
      const known = new Set(prev.messages.map((m) => m.id))
      const fresh = c.messages.filter((m) => m.from === 'them' && !known.has(m.id))
      if (fresh.length) notify.push('message', `m:${fresh[fresh.length - 1].id}`, `New message from ${c.peer?.penName ?? 'someone'}`, fresh[fresh.length - 1].text, `/chat/${c.id}`)
    }
    const m = getDb().match
    update({
      conversations: next,
      // A chat that was reported and has expired is no longer shown, so there is nothing to hold on to.
      match: d.match?.state === 'found' && d.match.conversation_id && m.state !== 'found' ? { state: 'found', conversationId: d.match.conversation_id } : m,
    })
    updateAccount((a) => ({ ...a, blocked: d.blocked.map(toPeer) }))
  })().finally(() => {
    syncing = null
  })
  return syncing
}

async function checkMatch(): Promise<void> {
  const r = (await rpc('match_status')) as MatchReply | Reply
  if (!r.ok) return
  const s = r as MatchReply
  const cur = getDb().match
  if (s.state === 'found' && s.conversation_id) {
    await syncChats()
    update({ match: { state: 'found', conversationId: s.conversation_id } })
    showToast('You’re matched.')
  } else if (s.state === 'idle' && cur.state === 'searching') {
    update({ match: { state: 'idle' } })
  }
}

let timer: ReturnType<typeof setInterval> | null = null

/** Checks the server every few seconds while someone is signed in: for a match while searching, and for new messages always. */
export function startPolling(): void {
  if (timer) return
  timer = setInterval(() => {
    if (!getDb().signedIn) return stopPolling()
    void (getDb().match.state === 'searching' ? checkMatch() : Promise.resolve()).then(syncChats)
  }, POLL_MS)
  void syncChats()
}

export function stopPolling(): void {
  if (timer) clearInterval(timer)
  timer = null
}

const reasonOf = (r: ReportReason): string => (['harassment', 'threats', 'sexual', 'scam', 'self-harm', 'impersonation', 'hate'].includes(r) ? r : 'other')

/** Runs a change on the server and then refreshes. If the server says no, the screen is put right. */
function settle(call: Promise<Reply>): void {
  void call.then((r) => {
    if (!r.ok) showToast(r.error)
    return syncChats()
  })
}

export const remoteMatch = {
  ...mockMatch,

  async start(): Promise<Res> {
    const db = getDb()
    const a = db.account
    if (!a) return { ok: false, error: 'Sign in first.' }
    // The server doesn't know about plans yet, so the app checks this one itself.
    if (!canChat(planState(db.subscription, now()))) return { ok: false, error: 'Peer chat needs an active plan.', code: 'needs-plan' }
    const r = (await rpc('start_matching')) as MatchReply | Reply
    if (!r.ok) return { ok: false, error: (r as { error: string }).error, code: (r as { code: string }).code }
    const s = r as MatchReply
    if (s.state === 'found' && s.conversation_id) {
      await syncChats()
      update({ match: { state: 'found', conversationId: s.conversation_id } })
    } else update({ match: { state: 'searching', startedAt: now() } })
    startPolling()
    return { ok: true, value: undefined }
  },

  pause(): void {
    update({ match: { state: 'paused' } })
    updateAccount((a) => ({ ...a, public: { ...a.public, openToChats: false } }))
    settle(rpc('cancel_matching'))
    void rpc('update_profile', { p_open_to_chats: false })
  },

  cancelSearch(): void {
    update({ match: { state: 'idle' } })
    void rpc('cancel_matching')
  },

  setOpenToChats(open: boolean): void {
    mockMatch.setOpenToChats(open)
    void rpc('update_profile', { p_open_to_chats: open })
    if (!open) void rpc('cancel_matching')
  },

  resume(): void {
    if (getDb().signedIn) startPolling()
  },
}

export const remoteChat = {
  ...mockChat,

  /** The server deletes chats on time; the app only mirrors what it is told. */
  sweep(): void {},

  open(id: string): void {
    mockChat.open(id)
    void rpc('mark_read', { p_conversation: id })
  },

  async send(id: string, text: string): Promise<Res<{ message: Message }>> {
    const db = getDb()
    const conv = db.conversations.find((c) => c.id === id)
    if (!db.account || !conv) return { ok: false, error: 'That conversation is gone.' }
    if (conv.ended) return { ok: false, error: 'This conversation has ended.', code: 'ended' }
    if (!canChat(planState(db.subscription, now()))) return { ok: false, error: 'Your plan has ended, so chats are read-only.', code: 'read-only' }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'Write a message first.', code: 'empty' }
    // Checked here for a quick answer, and again on the server so the rule holds even if the app is changed.
    const check = detectBlockedContent(trimmed)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const r = await rpc('send_message', { p_conversation: id, p_text: trimmed })
    if (!r.ok) return { ok: false, error: r.error, code: r.code }
    const sent = r.message as { id: string; text: string; at: string }
    const m: Message = { id: sent.id, from: 'me', text: sent.text, at: ms(sent.at) }
    update((s) => ({ conversations: s.conversations.map((c) => (c.id === id && !c.messages.some((x) => x.id === m.id) ? { ...c, messages: [...c.messages, m], lastAt: m.at } : c)) }))
    return { ok: true, value: { message: m } }
  },

  setMuted(id: string, muted: boolean): void {
    mockChat.setMuted(id, muted)
    settle(rpc('set_chat_prefs', { p_conversation: id, p_muted: muted }))
  },

  archive(id: string, archived: boolean): void {
    mockChat.archive(id, archived)
    settle(rpc('set_chat_prefs', { p_conversation: id, p_archived: archived }))
  },

  end(id: string): void {
    update((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, ended: true } : c)), match: s.match.state === 'found' && s.match.conversationId === id ? { state: 'idle' } : s.match }))
    settle(rpc('end_conversation', { p_conversation: id }))
  },

  proposeDisappearing(id: string): void {
    settle(rpc('propose_disappearing', { p_conversation: id }))
  },

  turnOffDisappearing(id: string): void {
    settle(rpc('turn_off_disappearing', { p_conversation: id }))
  },

  block(id: string, alsoReport: boolean): void {
    update((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      match: s.match.state === 'found' && s.match.conversationId === id ? { state: 'idle' } : s.match,
      openConversationId: s.openConversationId === id ? null : s.openConversationId,
    }))
    settle(rpc('block_peer', { p_conversation: id, p_also_report: alsoReport }))
  },

  unblock(blockId: string): void {
    updateAccount((a) => ({ ...a, blocked: a.blocked.filter((p) => p.id !== blockId) }))
    settle(rpc('unblock_peer', { p_block: blockId }))
  },
}

export const remoteReport = {
  ...mockReport,

  /** Chat reports go to the server, which keeps the last messages as they are now. Posts, groups and sessions are still on the device. */
  submit(input: Parameters<typeof mockReport.submit>[0]): void {
    if (!input.conversationId) return mockReport.submit(input)
    settle(rpc('report_chat', { p_conversation: input.conversationId, p_reason: reasonOf(input.reason), p_note: input.note }))
    notify.push('safety', `report:${input.conversationId}:${now()}`, 'We received your report', 'A person on our team will review it. You are not named to the other person.', '/home')
  },
}

export type { ReportTarget }
