import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { facilitatorRemove, facilitatorSend, loadFacilitatorRooms, remoteGroups, syncGroups, syncStaffGroups } from '../src/backend/remoteGroups'
import type { GroupChat } from '../src/api/types'
import { participants } from '../src/lib/groupChat'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'
import { DEFAULT_SETTINGS } from '../src/api/auth'

const room = (over: Partial<GroupChat> = {}): GroupChat => ({
  id: 'gc-grief-20261028', topic: 'Surviving grief', blurb: 'A gentle hour', facilitatorId: 't-amina', startsAt: Date.now() + 86_400_000, durationMin: 60, capacity: 12,
  takenOthers: 3, registered: false, messages: [], posted: 0, ...over,
})

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name in replies) return { data: replies[name], error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

beforeEach(() => {
  resetClock()
  update({ ...freshState(), account: { settings: { ...DEFAULT_SETTINGS } } } as never)
})
afterEach(() => setClient(null))

describe('what members see', () => {
  it('takes the rooms from the server', async () => {
    fake({ group_list: { ok: true, groups: [room({ registered: true })] } })
    await syncGroups()
    expect(getDb().groupChats).toHaveLength(1)
    expect(getDb().groupChats[0].registered).toBe(true)
  })

  it('keeps the rooms it had when the server can’t be reached', async () => {
    update({ groupChats: [room()] })
    fake({ group_list: null })
    await syncGroups()
    expect(getDb().groupChats).toHaveLength(1)
  })

  it('signs up through the server and shows the server’s refusal', async () => {
    const calls = fake({ group_register: { ok: false, code: 'plan', error: 'Group chats are part of a plan. Choose one to take part.' } })
    const r = await remoteGroups.register('gc-grief-20261028')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('plan')
    expect(calls.find((c) => c.name === 'group_register')?.args).toEqual({ p_id: 'gc-grief-20261028' })
  })

  it('does not call the server for an empty message', async () => {
    const calls = fake()
    const r = await remoteGroups.send('gc-grief-20261028', '   ')
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('tells a member once when a room they signed up for is cancelled', async () => {
    update({ groupChats: [room({ registered: true })] })
    fake({ group_list: { ok: true, groups: [room({ registered: false, cancelled: { reason: 'Unwell', by: 'Echo team', at: Date.now() } })] } })
    await syncGroups()
    await syncGroups()
    expect(getDb().notifications.filter((n) => n.key === 'g:gc-grief-20261028:cancelled')).toHaveLength(1)
  })

  it('tells a member when a moderator removes them', async () => {
    update({ groupChats: [room({ registered: true })] })
    fake({ group_list: { ok: true, groups: [room({ removed: [{ name: 'RiverStone', reason: '', by: 'A moderator', at: Date.now() }] })] } })
    await syncGroups()
    expect(getDb().notifications.some((n) => n.key === 'g:gc-grief-20261028:removed')).toBe(true)
  })
})

describe('what staff do', () => {
  it('lists who is in a room from the roster', async () => {
    fake({ admin_groups: { ok: true, groups: [room({ roster: ['RiverStone', 'CedarLeaf'], removed: [{ name: 'Gone', reason: 'x', by: 'M', at: 1 }] })] } })
    await syncStaffGroups()
    const names = participants(getDb().groupChats[0], undefined)
    expect(names.map((p) => p.name).sort()).toEqual(['CedarLeaf', 'Gone', 'RiverStone'])
    expect(names.find((p) => p.name === 'Gone')?.removed).toBe(true)
  })

  it('sends the time as an ISO date and refreshes the list', async () => {
    const calls = fake({ admin_schedule_group: { ok: true, id: 'gc-custom-1' }, admin_groups: { ok: true, groups: [room({ id: 'gc-custom-1' })] } })
    const r = await remoteGroups.schedule({ topic: 'A topic long enough', blurb: 'A description that is long enough', facilitatorId: 't-amina', startsAt: Date.UTC(2026, 9, 30, 11), durationMin: 60, capacity: 10 })
    expect(r.ok && r.value.id).toBe('gc-custom-1')
    expect(calls.find((c) => c.name === 'admin_schedule_group')?.args?.p_starts).toBe('2026-10-30T11:00:00.000Z')
    expect(getDb().groupChats[0].id).toBe('gc-custom-1')
  })

  it('shows the server’s reason when a removal is refused', async () => {
    fake({ admin_remove_from_group: { ok: false, code: 'reason', error: 'A reason is required.' } })
    const r = await remoteGroups.removeParticipant('gc-grief-20261028', 'RiverStone', 'x')
    expect(r.ok).toBe(false)
  })
})

describe('what a facilitator does', () => {
  it('loads their rooms and sends a line', async () => {
    const calls = fake({ portal_groups: { ok: true, groups: [{ id: 'g1', topic: 'T', blurb: 'B', startsAt: 1, durationMin: 60, capacity: 10, status: 'open', registered: 4, messages: [] }] } })
    expect((await loadFacilitatorRooms())?.[0].id).toBe('g1')
    expect((await facilitatorSend('g1', 'Welcome')).ok).toBe(true)
    expect(calls.find((c) => c.name === 'portal_group_send')?.args).toEqual({ p_id: 'g1', p_text: 'Welcome' })
  })
})

describe('waiting list, editing and removing a line', () => {
  it('joins and leaves the waiting list through the server', async () => {
    const calls = fake({ group_waitlist_join: { ok: false, code: 'open', error: 'There is a place free. Sign up instead.' } })
    const r = await remoteGroups.waitlistJoin('gc-grief-20261028')
    expect(r.ok).toBe(false)
    await remoteGroups.waitlistLeave('gc-grief-20261028')
    expect(calls.map((c) => c.name)).toContain('group_waitlist_leave')
  })

  it('tells a member when a place opens up for them, and when a room they are in moves', async () => {
    update({ groupChats: [room({ waitlisted: true }), room({ id: 'gc-other', registered: true })] })
    fake({ group_list: { ok: true, groups: [room({ registered: true, waitlisted: false }), room({ id: 'gc-other', registered: true, startsAt: Date.now() + 2 * 86_400_000 })] } })
    await syncGroups()
    const keys = getDb().notifications.map((n) => n.key)
    expect(keys).toContain('g:gc-grief-20261028:promoted')
    expect(keys.some((k) => k.startsWith('g:gc-other:moved'))).toBe(true)
  })

  it('sends an edit with the new time as an ISO date', async () => {
    const calls = fake({ admin_groups: { ok: true, groups: [room()] } })
    const r = await remoteGroups.edit('gc-grief-20261028', { topic: 'A topic long enough', blurb: 'A description that is long enough', facilitatorId: 't-amina', startsAt: Date.UTC(2026, 10, 3, 11), durationMin: 45, capacity: 10 })
    expect(r.ok).toBe(true)
    expect(calls.find((c) => c.name === 'admin_edit_group')?.args).toMatchObject({ p_id: 'gc-grief-20261028', p_starts: '2026-11-03T11:00:00.000Z', p_duration: 45, p_capacity: 10 })
  })

  it('removes a line as a facilitator or as staff', async () => {
    const calls = fake()
    expect((await facilitatorRemove('g1', 'm1')).ok).toBe(true)
    expect((await remoteGroups.removeMessage('g1', 'm1', 'Unkind to another member')).ok).toBe(true)
    expect(calls.map((c) => c.name)).toEqual(['portal_group_remove_message', 'admin_remove_group_message'])
  })
})
