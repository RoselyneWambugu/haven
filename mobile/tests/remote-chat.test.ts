import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteChat, remoteMatch, remoteReport, stopPolling, syncChats } from '../src/backend/remoteChat'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'
import type { Account } from '../src/api/types'
import { DEFAULT_SETTINGS } from '../src/api/auth'

const PEER = { id: 'pm1', pen_name: 'RiverStone', avatar: 'leaf', languages: ['English'], age_band: '25-34' }
const iso = (n: number) => new Date(Date.UTC(2026, 9, 21, 8, 0, n)).toISOString()
const CONV = {
  id: 'c1', kind: 'peer', peer: PEER, created_at: iso(0), expires_at: iso(86400), ended: false, muted: false, archived: false, disappearing: 'off', unread: 1, last_at: iso(5),
  messages: [
    { id: 'm1', from: 'system', text: 'You’re matched.', at: iso(0) },
    { id: 'm2', from: 'them', text: 'Hello there', at: iso(5) },
  ],
}

interface Script { chats?: unknown; match?: unknown; start?: unknown; send?: unknown; fail?: string }

function fake(script: Script = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const client = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (script.fail === name) return { data: null, error: { message: 'down' } }
      if (name === 'my_chats') return { data: script.chats ?? { ok: true, conversations: [CONV], blocked: [], match: null }, error: null }
      if (name === 'start_matching') return { data: script.start ?? { ok: true, state: 'searching', conversation_id: null }, error: null }
      if (name === 'match_status') return { data: script.match ?? { ok: true, state: 'searching', conversation_id: null }, error: null }
      if (name === 'send_message') return { data: script.send ?? { ok: true, message: { id: 'm3', from: 'me', text: 'Hi back', at: iso(9) } }, error: null }
      return { data: { ok: true }, error: null }
    },
  }
  setClient(client as unknown as SupabaseClient)
  return calls
}

const member = { id: 'u1', standing: 'good', settings: { ...DEFAULT_SETTINGS, quietHours: false }, public: { openToChats: true, penName: 'QuietPine' }, blocked: [] } as unknown as Account
const paid = { plan: 'monthly', status: 'active', renewsAt: Date.now() + 1e10 }

beforeEach(() => {
  resetClock()
  update({ ...freshState(), account: member, signedIn: true })
})
afterEach(() => stopPolling())

describe('syncing chats', () => {
  it('shows the server’s conversations with the other person’s pen name and no account details', async () => {
    fake()
    await syncChats()
    const [c] = getDb().conversations
    expect(c).toMatchObject({ id: 'c1', kind: 'peer', unread: 1, ended: false })
    expect(c.peer).toMatchObject({ penName: 'RiverStone', avatar: 'leaf', ageBand: '25-34' })
    expect(c.messages.map((m) => m.from)).toEqual(['system', 'them'])
    expect(c.createdAt).toBe(Date.UTC(2026, 9, 21, 8, 0, 0))
  })

  it('drops a chat the server has deleted', async () => {
    fake()
    await syncChats()
    fake({ chats: { ok: true, conversations: [], blocked: [], match: null } })
    await syncChats()
    expect(getDb().conversations).toEqual([])
  })

  it('tells the member about a new message in a chat that is not open, unless it is muted', async () => {
    fake()
    await syncChats()
    const before = getDb().notifications.length
    fake({ chats: { ok: true, conversations: [{ ...CONV, messages: [...CONV.messages, { id: 'm9', from: 'them', text: 'Are you there?', at: iso(20) }] }], blocked: [], match: null } })
    await syncChats()
    expect(getDb().notifications.length).toBe(before + 1)
    expect(getDb().notifications[0].title).toContain('RiverStone')
  })

  it('keeps blocked people from the server as the blocked list', async () => {
    fake({ chats: { ok: true, conversations: [], blocked: [{ id: 'b1', pen_name: 'LoudFern', avatar: 'fern', languages: [], age_band: '35-44' }], match: null } })
    await syncChats()
    expect(getDb().account?.blocked[0]).toMatchObject({ id: 'b1', penName: 'LoudFern' })
  })

  it('leaves everything as it was when the server can’t be reached', async () => {
    fake()
    await syncChats()
    fake({ fail: 'my_chats' })
    await syncChats()
    expect(getDb().conversations).toHaveLength(1)
  })
})

describe('matching', () => {
  it('needs a plan, checked on the device until billing is on the server', async () => {
    fake()
    expect(await remoteMatch.start()).toMatchObject({ ok: false, code: 'needs-plan' })
  })

  it('starts searching, and shows the server’s reason when it refuses', async () => {
    update({ subscription: paid } as never)
    fake()
    expect((await remoteMatch.start()).ok).toBe(true)
    expect(getDb().match.state).toBe('searching')
    stopPolling()
    fake({ start: { ok: false, code: 'chat-limit', error: 'You have 5 chats open.' } })
    expect(await remoteMatch.start()).toMatchObject({ ok: false, code: 'chat-limit' })
  })

  it('goes straight to the new chat when someone was already waiting', async () => {
    update({ subscription: paid } as never)
    fake({ start: { ok: true, state: 'found', conversation_id: 'c1' } })
    await remoteMatch.start()
    expect(getDb().match).toEqual({ state: 'found', conversationId: 'c1' })
    expect(getDb().conversations[0].id).toBe('c1')
  })

  it('stopping the search tells the server', async () => {
    const calls = fake()
    remoteMatch.cancelSearch()
    expect(getDb().match.state).toBe('idle')
    expect(calls.some((c) => c.name === 'cancel_matching')).toBe(true)
  })
})

describe('chatting', () => {
  beforeEach(async () => {
    update({ subscription: paid } as never)
    fake()
    await syncChats()
  })

  it('stops contact details on the device without calling the server', async () => {
    const calls = fake()
    const r = await remoteChat.send('c1', 'call me on 0712 345 678')
    expect(r).toMatchObject({ ok: false, code: 'blocked' })
    expect(calls.some((c) => c.name === 'send_message')).toBe(false)
  })

  it('sends a message and shows it as sent', async () => {
    const calls = fake()
    const r = await remoteChat.send('c1', '  Hi back  ')
    expect(r.ok).toBe(true)
    expect(calls.find((c) => c.name === 'send_message')?.args).toEqual({ p_conversation: 'c1', p_text: 'Hi back' })
    expect(getDb().conversations[0].messages.at(-1)).toMatchObject({ id: 'm3', from: 'me' })
  })

  it('passes on the server’s refusal', async () => {
    fake({ send: { ok: false, code: 'blocked', error: 'Links and contact details can’t be shared here.' } })
    expect(await remoteChat.send('c1', 'hello')).toMatchObject({ ok: false, code: 'blocked' })
    expect(getDb().conversations[0].messages).toHaveLength(2)
  })

  it('removes a blocked chat at once and asks the server to block', async () => {
    const calls = fake()
    remoteChat.block('c1', true)
    expect(getDb().conversations).toEqual([])
    expect(calls.find((c) => c.name === 'block_peer')?.args).toEqual({ p_conversation: 'c1', p_also_report: true })
  })

  it('reports a chat to the server with a reason it knows', async () => {
    const calls = fake()
    remoteReport.submit({ target: 'member', targetId: 'pm1', reason: 'therapist-conduct', note: 'x', conversationId: 'c1' })
    expect(calls.find((c) => c.name === 'report_chat')?.args).toMatchObject({ p_conversation: 'c1', p_reason: 'other' })
  })

  it('mutes through the server', () => {
    const calls = fake()
    remoteChat.setMuted('c1', true)
    expect(getDb().conversations[0].muted).toBe(true)
    expect(calls.find((c) => c.name === 'set_chat_prefs')?.args).toEqual({ p_conversation: 'c1', p_muted: true })
  })

  it('does not sweep on the device, because the server deletes chats on time', () => {
    const before = getDb().conversations
    remoteChat.sweep()
    expect(getDb().conversations).toBe(before)
  })
})
