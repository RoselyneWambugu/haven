import { PEERS, THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { neighbouringBands } from '@/lib/identity'
import { uid } from '@/lib/id'
import { canChat, planState } from '@/lib/plan'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { getDb, update, updateAccount } from '@/store/db'
import { showToast } from '@/store/toast'
import { hasPlan, requirePlan } from './access'
import { notify } from './notify'
import { peerReply, postReply, therapistThreadReply } from './bot'
import { MAX_PEER_CHATS, openPeerChats } from '@/lib/limits'
import { sweep, timeLeft, warnBeforeMs } from '@/lib/chatLife'
import { chatSnapshot, commentSnapshot, groupSnapshot, postSnapshot, priorReports, sessionSnapshot } from '@/lib/snapshot'
import { dayAndClock } from '@/lib/time'
import { spaceById } from '@/data/spaces'
import { needsCheck } from '@/lib/spaces'
import type { AvatarKind, Conversation, EvidenceLine, ReportRecord, ForumComment, ForumPost, Message, Peer, ReportReason, ReportTarget, Res } from './types'

const SEC = 1000
const MIN = 60_000

const timers = new Map<string, ReturnType<typeof setTimeout>>()
function later(key: string, ms: number, fn: () => void) {
  const prev = timers.get(key)
  if (prev) clearTimeout(prev)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      fn()
    }, ms),
  )
}

const msg = (from: Message['from'], text: string): Message => ({ id: uid('m'), from, text, at: now() })

function setConv(id: string, fn: (c: Conversation) => Conversation) {
  update((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)) }))
}

// ---------------------------------------------------------------------------
// matching (PRD MAT-1 to MAT-8)
// ---------------------------------------------------------------------------

function pickPeer(): Peer | null {
  const db = getDb()
  const a = db.account
  if (!a) return null
  const cfg = db.content.matching
  const blocked = new Set(a.blocked.map((p) => p.id))
  const busy = new Set(db.conversations.filter((c) => c.peer && !c.ended).map((c) => c.peer!.id))
  // Two people who ended a match are not paired again until the wait is over (MAT-4).
  const cooling = new Set(db.conversations.filter((c) => c.peer && c.ended && now() - c.lastAt < cfg.rematchCooldownDays * 24 * 3600_000).map((c) => c.peer!.id))
  const shared = (p: Peer) => p.languages.some((l) => a.public.languages.includes(l))
  const ok = (p: Peer) => p.id !== 'p-quiet' && !blocked.has(p.id) && !busy.has(p.id) && !cooling.has(p.id) && shared(p)
  // Topics only ever break ties between people who already share an age range and a language (MAT-7).
  const choose = (list: Peer[]): Peer => {
    if (cfg.softTopicWeight <= 0) return list[Math.floor(Math.random() * list.length)]
    const overlap = (p: Peer) => (p.topics ?? []).filter((t) => a.public.topics.includes(t)).length
    const best = Math.max(...list.map(overlap))
    const top = list.filter((p) => overlap(p) === best)
    return top[Math.floor(Math.random() * top.length)]
  }
  const exact = PEERS.filter((p) => ok(p) && p.ageBand === a.public.ageBand)
  if (exact.length) return choose(exact)
  if (!cfg.neighbourFallback) return null
  const near = PEERS.filter((p) => ok(p) && neighbouringBands(a.public.ageBand).includes(p.ageBand))
  return near.length ? choose(near) : null
}

function resolveMatch() {
  const db = getDb()
  if (db.match.state !== 'searching') return
  if (openPeerChats(db.conversations, db.sessions, now()) >= MAX_PEER_CHATS) {
    update({ match: { state: 'idle' } })
    return
  }
  const peer = pickPeer()
  if (!peer) {
    later('match', 6 * SEC, resolveMatch) // keep looking
    return
  }
  const conv: Conversation = {
    id: uid('c'), kind: 'peer', peer, therapistId: null,
    messages: [msg('system', `You’re matched with ${peer.penName}. Say hello when you’re ready.`), msg('system', 'Chats end and are deleted 24 hours after they start, unless one is reported.')],
    muted: false, archived: false, ended: false, disappearing: 'off', unread: 1, createdAt: now(), lastAt: now(),
  }
  update((s) => ({ conversations: [conv, ...s.conversations], match: { state: 'found', conversationId: conv.id } }))
  showToast(`You’re matched with ${peer.penName}.`)
}

export const match = {
  start(): Res {
    const db = getDb()
    const a = db.account
    if (!a) return { ok: false, error: 'Sign in first.' }
    if (a.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    if (!canChat(planState(db.subscription, now()))) return { ok: false, error: 'Peer chat needs an active plan.', code: 'needs-plan' }
    if (!a.public.openToChats) return { ok: false, error: 'Matching is paused. Turn on “Open to new chats” first.', code: 'paused-matching' }
    if (openPeerChats(db.conversations, db.sessions, now()) >= MAX_PEER_CHATS) return { ok: false, error: `You have ${MAX_PEER_CHATS} chats open, which is the most at one time. End one, or wait for one to expire, to meet someone new.`, code: 'chat-limit' }
    update({ match: { state: 'searching', startedAt: now() } })
    later('match', 4 * SEC, resolveMatch)
    return { ok: true, value: undefined }
  },
  pause(): void {
    timers.delete('match')
    update({ match: { state: 'paused' } })
    updateAccount((a) => ({ ...a, public: { ...a.public, openToChats: false } }))
  },
  cancelSearch(): void {
    const t = timers.get('match')
    if (t) clearTimeout(t)
    timers.delete('match')
    update({ match: { state: 'idle' } })
  },
  acknowledgeFound(): void {
    if (getDb().match.state === 'found') update({ match: { state: 'idle' } })
  },
  setOpenToChats(open: boolean): void {
    updateAccount((a) => ({ ...a, public: { ...a.public, openToChats: open } }))
    if (!open) {
      const t = timers.get('match')
      if (t) clearTimeout(t)
      update({ match: { state: 'paused' } })
    } else if (getDb().match.state === 'paused') update({ match: { state: 'idle' } })
  },
  /** Called when the app starts, in case a search was in progress. */
  resume(): void {
    if (getDb().match.state === 'searching') later('match', 3 * SEC, resolveMatch)
  },
}

// ---------------------------------------------------------------------------
// chat (PRD MSG-1 to MSG-8, CHL-1 to CHL-5)
// ---------------------------------------------------------------------------

export const chat = {
  /**
   * Ends and deletes chats that are 24 hours old, and adds an "ending soon" note an hour before. A reported chat is moved
   * out of the member's view and kept for the safety review. Safe to call often.
   */
  sweep(): void {
    const db = getDb()
    const t = now()
    const reported = new Set(db.reports.flatMap((r) => (r.conversationId ? [r.conversationId] : [])))
    const { keep, retain, drop } = sweep(db.conversations, db.sessions, reported, t)
    const warn = keep.filter((c) => !c.warned && !c.ended && timeLeft(c, db.sessions, t) <= warnBeforeMs(c))
    if (!drop.length && !retain.length && !warn.length) return
    const gone = new Set([...drop, ...retain].map((c) => c.id))
    update((s) => ({
      conversations: keep.map((c) => (warn.some((w) => w.id === c.id) ? { ...c, warned: true, messages: [...c.messages, msg('system', c.kind === 'therapist' ? 'This chat ends in about a day and will then be deleted.' : 'This chat ends in about an hour and will then be deleted.')] } : c)),
      retained: [...s.retained, ...retain.filter((r) => !s.retained.some((x) => x.id === r.id))],
      openConversationId: s.openConversationId && gone.has(s.openConversationId) ? null : s.openConversationId,
      match: s.match.state === 'found' && gone.has(s.match.conversationId) ? { state: 'idle' } : s.match,
    }))
  },

  open(id: string): void {
    update({ openConversationId: id })
    setConv(id, (c) => ({ ...c, unread: 0 }))
  },
  close(): void {
    update({ openConversationId: null })
  },

  send(id: string, text: string): Res<{ message: Message }> {
    const db = getDb()
    const conv = db.conversations.find((c) => c.id === id)
    if (!db.account || !conv) return { ok: false, error: 'That conversation is gone.' }
    if (conv.ended) return { ok: false, error: 'This conversation has ended.', code: 'ended' }
    if (db.account.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    if (conv.kind === 'peer' && !canChat(planState(db.subscription, now()))) {
      return { ok: false, error: 'Your plan has ended, so chats are read-only.', code: 'read-only' }
    }
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'Write a message first.', code: 'empty' }
    // The server checks again, so the rule holds even if the app is modified.
    const check = detectBlockedContent(trimmed)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const m = msg('me', trimmed)
    setConv(id, (c) => ({ ...c, messages: [...c.messages, m], lastAt: m.at }))
    const delay = 1500 + Math.floor(Math.random() * 2000)
    later(`reply-${id}`, delay, () => {
      const cur = getDb().conversations.find((c) => c.id === id)
      if (!cur || cur.ended) return
      const reply = msg('them', conv.kind === 'peer' ? peerReply(trimmed) : therapistThreadReply())
      const open = getDb().openConversationId === id
      setConv(id, (c) => ({ ...c, messages: [...c.messages, reply], lastAt: reply.at, unread: open ? 0 : c.unread + 1 }))
      if (!open && !cur.muted) {
        const from = cur.peer?.penName ?? THERAPISTS.find((t) => t.id === cur.therapistId)?.name ?? 'Your therapist'
        notify.push('message', `m:${reply.id}`, `New message from ${from}`, reply.text, `/chat/${id}`)
      }
    })
    return { ok: true, value: { message: m } }
  },

  setMuted(id: string, muted: boolean): void {
    setConv(id, (c) => ({ ...c, muted }))
  },
  archive(id: string, archived: boolean): void {
    setConv(id, (c) => ({ ...c, archived }))
  },

  end(id: string): void {
    setConv(id, (c) => ({ ...c, ended: true, messages: [...c.messages, msg('system', 'This conversation has ended.')], lastAt: now() }))
    const db = getDb()
    if (db.match.state === 'found' && db.match.conversationId === id) update({ match: { state: 'idle' } })
  },

  /** Disappearing chats need both people to agree (PRD MSG-7). */
  proposeDisappearing(id: string): void {
    if (!getDb().content.flags.disappearing) return void showToast('Disappearing chats aren’t available right now.')
    setConv(id, (c) => ({ ...c, disappearing: 'proposed-by-me', messages: [...c.messages, msg('system', 'You asked for a disappearing chat. Waiting for them to agree.')] }))
    later(`dis-${id}`, 2500, () =>
      setConv(id, (c) =>
        c.disappearing === 'proposed-by-me'
          ? { ...c, disappearing: 'on', messages: [...c.messages, msg('system', 'Disappearing chat is on. New messages disappear after 24 hours.')] }
          : c,
      ),
    )
  },
  turnOffDisappearing(id: string): void {
    setConv(id, (c) => ({ ...c, disappearing: 'off', messages: [...c.messages, msg('system', 'Disappearing chat is off.')] }))
  },

  block(id: string, alsoReport: boolean): void {
    const db = getDb()
    const conv = db.conversations.find((c) => c.id === id)
    if (!conv?.peer) return
    const peer = conv.peer
    if (alsoReport) report.submit({ target: 'member', targetId: peer.id, reason: 'other', note: 'Blocked and reported from chat', conversationId: id })
    updateAccount((a) => ({ ...a, blocked: [...a.blocked.filter((p) => p.id !== peer.id), peer] }))
    update((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      match: s.match.state === 'found' && s.match.conversationId === id ? { state: 'idle' } : s.match,
      openConversationId: s.openConversationId === id ? null : s.openConversationId,
    }))
  },
  unblock(peerId: string): void {
    updateAccount((a) => ({ ...a, blocked: a.blocked.filter((p) => p.id !== peerId) }))
  },
}

// ---------------------------------------------------------------------------
// reports (PRD SAF-1 to SAF-4)
// ---------------------------------------------------------------------------

export const report = {
  /**
   * Keeps what was reported as it is right now (SAF-3). Pass `conversationId` for a chat, or `postId` for a post or comment.
   * The snapshot stays with the report even if the content is later edited, deleted or set to disappear.
   */
  submit(input: { target: ReportTarget; targetId: string; reason: ReportReason; note: string; conversationId?: string; postId?: string; sessionId?: string; groupChatId?: string }): void {
    const db = getDb()
    const at = now()
    const conv = input.conversationId ? db.conversations.find((c) => c.id === input.conversationId) : undefined
    const post = input.postId ? db.posts.find((p) => p.id === input.postId) : undefined
    const group = input.groupChatId ? db.groupChats.find((g) => g.id === input.groupChatId) : undefined
    const sess = input.sessionId ? db.sessions.find((x) => x.id === input.sessionId) : undefined
    let snapshot: EvidenceLine[] | undefined
    let reportedName: string | undefined
    let queue: ReportRecord['queue']
    let therapistId: string | undefined
    if (group) {
      snapshot = groupSnapshot(group.messages, input.targetId)
      reportedName = group.messages.find((m) => m.id === input.targetId)?.name
    } else if (sess) {
      const th = THERAPISTS.find((x) => x.id === sess.therapistId)
      const thread = db.conversations.find((c) => c.kind === 'therapist' && c.therapistId === sess.therapistId)
      snapshot = sessionSnapshot({ therapist: th?.name ?? 'a therapist', mode: sess.mode, when: dayAndClock(sess.start) }, input.note, thread?.messages)
      reportedName = th?.name
      queue = 'clinical'
      therapistId = sess.therapistId
    } else if (conv) {
      snapshot = chatSnapshot(conv.messages)
      reportedName = conv.peer?.penName
    } else if (post && input.target === 'comment') {
      snapshot = commentSnapshot(post, input.targetId)
      reportedName = post.comments.find((c) => c.id === input.targetId)?.authorName
    } else if (post && input.target === 'post') {
      snapshot = postSnapshot(post)
      reportedName = post.authorName
    }
    const record: ReportRecord = {
      id: uid('r'), target: input.target, targetId: input.targetId, reason: input.reason, note: input.note, at,
      reportedName, queue, therapistId, conversationId: input.conversationId, groupChatId: input.groupChatId, snapshot: snapshot?.length ? snapshot : undefined, priorReports: priorReports(db.reports, input.targetId, at),
    }
    update((s) => ({ reports: [...s.reports, record] }))
    notify.push('safety', `report:${record.id}`, 'We received your report', 'A person on our team will review it. You are not named to the other person.', '/home')
  },
}

// ---------------------------------------------------------------------------
// forum (PRD FRM-1 to FRM-15)
// ---------------------------------------------------------------------------

const EDIT_WINDOW = 15 * MIN

function setPost(id: string, fn: (p: ForumPost) => ForumPost) {
  update((s) => ({ posts: s.posts.map((p) => (p.id === id ? fn(p) : p)) }))
}

/** A peer and then a verified therapist reply to a member's own post, a little while after it is live. */
function scheduleReplies(id: string, wait = 1) {
  later(`reply-peer-${id}`, 20 * SEC * wait, () => addReply(id, 'peer'))
  later(`reply-th-${id}`, 45 * SEC * wait, () => addReply(id, 'therapist'))
}

function addReply(id: string, kind: 'peer' | 'therapist') {
  const db = getDb()
  const p = db.posts.find((x) => x.id === id)
  if (!p || !p.mine || p.status !== 'published' || !db.content.flags.forum) return
  if (p.comments.some((c) => (kind === 'therapist' ? !!c.therapistId : !c.mine && !c.therapistId))) return
  const { text, peer } = postReply(kind, p.title, p.body)
  const th = THERAPISTS.find((x) => x.id === spaceById(p.space)?.facilitatorId) ?? THERAPISTS[0]
  const c: ForumComment = {
    id: uid('cm'), authorName: kind === 'therapist' ? th.name : peer.name, authorAvatar: kind === 'therapist' ? 'leaf' : peer.avatar,
    therapistId: kind === 'therapist' ? th.id : null, therapistName: kind === 'therapist' ? th.name : null, text, at: now(), hiddenReason: null, mine: false,
  }
  setPost(id, (x) => ({ ...x, comments: [...x.comments, c] }))
  notify.push('forum', `reply:${c.id}`, 'New reply to your post', `${c.authorName} replied to “${p.title}”.`, `/forum/${id}`)
}

function publishPending(id: string) {
  const p = getDb().posts.find((x) => x.id === id)
  if (!p || p.status !== 'pending') return
  setPost(id, (x) => ({ ...x, status: 'published' }))
  showToast('Your post is now live.')
  notify.push('forum', `post:${id}`, 'Your post is now live', p.title, `/forum/${id}`)
  scheduleReplies(id)
}

export const forum = {
  create(input: { topic: string; title: string; body: string; space?: string }): Res<{ post: ForumPost; pending: boolean }> {
    const db = getDb()
    const a = db.account
    if (!a) return { ok: false, error: 'Sign in first.' }
    const gate = requirePlan('The community')
    if (gate) return gate as Res<{ post: ForumPost; pending: boolean }>
    if (a.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    if (!db.content.flags.forum) return { ok: false, error: 'Posting is paused for now. You can still read the community.', code: 'forum-off' }
    const title = input.title.trim()
    const body = input.body.trim()
    if (!title) return { ok: false, error: 'Add a title.', code: 'title' }
    if (body.length < 10) return { ok: false, error: 'Write a little more. A few sentences is plenty.', code: 'body' }
    const check = detectBlockedContent(`${title}\n${body}`)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const space = input.space ? spaceById(input.space) : undefined
    if (input.space && !space) return { ok: false, error: 'That space isn’t here.', code: 'space' }
    if (space && !db.spaces.includes(space.id)) return { ok: false, error: 'Join this space to post in it.', code: 'not-joined' }
    const pending = needsCheck(space, !!a.hasPostedBefore)
    const post: ForumPost = {
      id: uid('post'), authorName: a.public.penName, authorAvatar: a.public.avatar, authorKey: 'me', topic: space ? space.name : input.topic, space: space?.id, title, body,
      createdAt: now(), supports: 0, supportedByMe: false, comments: [], status: pending ? 'pending' : 'published', mine: true,
    }
    update((s) => ({ posts: [post, ...s.posts] }))
    updateAccount((x) => ({ ...x, hasPostedBefore: true }))
    if (pending) later(`pub-${post.id}`, 15 * SEC, () => publishPending(post.id))
    else scheduleReplies(post.id)
    return { ok: true, value: { post, pending } }
  },

  edit(id: string, patch: { title: string; body: string }): Res {
    const p = getDb().posts.find((x) => x.id === id)
    if (!p || !p.mine) return { ok: false, error: 'You can only edit your own post.' }
    if (now() - p.createdAt > EDIT_WINDOW) return { ok: false, error: 'You can edit a post for 15 minutes after posting.', code: 'window' }
    const check = detectBlockedContent(`${patch.title}\n${patch.body}`)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    setPost(id, (x) => ({ ...x, title: patch.title.trim(), body: patch.body.trim() }))
    return { ok: true, value: undefined }
  },

  remove(id: string): void {
    update((s) => ({ posts: s.posts.filter((p) => !(p.id === id && p.mine)) }))
  },

  comment(postId: string, text: string): Res<{ comment: ForumComment }> {
    const a = getDb().account
    const post = getDb().posts.find((p) => p.id === postId)
    if (!a || !post) return { ok: false, error: 'That post is gone.' }
    const gate = requirePlan('The community')
    if (gate) return gate as Res<{ comment: ForumComment }>
    if (!getDb().content.flags.forum) return { ok: false, error: 'Comments are paused for now.', code: 'forum-off' }
    if (post.status !== 'published') return { ok: false, error: 'You can comment once the post is live.', code: 'pending' }
    if (a.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    const t = text.trim()
    if (!t) return { ok: false, error: 'Write a comment first.', code: 'empty' }
    const check = detectBlockedContent(t)
    if (check.blocked) return { ok: false, error: explainBlock(check.reasons), code: 'blocked' }
    const c: ForumComment = {
      id: uid('cm'), authorName: a.public.penName, authorAvatar: a.public.avatar, therapistId: null, therapistName: null,
      text: t, at: now(), hiddenReason: null, mine: true,
    }
    setPost(postId, (p) => ({ ...p, comments: [...p.comments, c] }))
    return { ok: true, value: { comment: c } }
  },

  toggleSupport(id: string): void {
    if (!hasPlan()) return void showToast('The community needs an active plan.')
    setPost(id, (p) => ({ ...p, supportedByMe: !p.supportedByMe, supports: p.supports + (p.supportedByMe ? -1 : 1) }))
  },

  hide(id: string): void {
    update((s) => ({ hiddenPostIds: [...s.hiddenPostIds, id] }))
  },
  muteAuthor(authorKey: string): void {
    update((s) => ({ mutedAuthors: s.mutedAuthors.includes(authorKey) ? s.mutedAuthors : [...s.mutedAuthors, authorKey] }))
  },
  unmuteAuthor(authorKey: string): void {
    update((s) => ({ mutedAuthors: s.mutedAuthors.filter((k) => k !== authorKey) }))
  },

  resume(): void {
    for (const p of getDb().posts) {
      if (p.status === 'pending') later(`pub-${p.id}`, 4 * SEC, () => publishPending(p.id))
      else if (p.mine && p.status === 'published' && now() - p.createdAt < 10 * MIN) scheduleReplies(p.id, 0.2)
    }
  },
}

export type { AvatarKind }
