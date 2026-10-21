import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { remoteResources, remoteSuggestService, remoteTickets, syncHelp, syncStaffHelp, syncTickets } from '../src/backend/remoteHelp'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock, now } from '../src/lib/clock'
import { DEFAULT_SETTINGS } from '../src/api/auth'

const DEPT = { id: 'billing', title: 'Billing and plans', blurb: 'Payments', icon: 'wallet', owner: 'Billing', slaHours: 24, enabled: true }
const ART = { id: 'a1', deptId: 'billing', title: 'How do refunds work?', intro: 'We put it right.', steps: ['One step here'], related: [], updatedAt: now(), published: true }
const CONTENT = () => ({
  ok: true, departments: [DEPT], articles: [ART], popular: ['a1'], emergency: { name: 'Emergency services', phone: '112', hours: 'Always open', languages: 'Any' },
  crisisLines: [{ id: 'cl1', name: 'Line', phone: '1199', hours: '24h', languages: 'English' }], supportOrgs: [],
})
const TICKET = { id: 't1', deptId: 'billing', subject: 'Charged twice', status: 'replied', unread: true, createdAt: now(), routedToCrisis: false, messages: [{ id: 'm1', from: 'me', text: 'Help', at: now() }, { id: 'm2', from: 'staff', text: 'Sorted', at: now() }] }

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name in replies) return { data: replies[name], error: null }
      if (name === 'help_content') return { data: CONTENT(), error: null }
      if (name === 'my_tickets') return { data: { ok: true, tickets: [TICKET] }, error: null }
      if (name === 'admin_help') return { data: { ...CONTENT(), crisisVerifiedAt: 5, suggestions: [], tickets: [{ ...TICKET, penName: 'QuietPine' }] }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return calls
}

beforeEach(() => {
  resetClock()
  update({ ...freshState() } as never)
})
afterEach(() => setClient(null))

describe('what members read', () => {
  it('replaces the built-in help with the published help from the server', async () => {
    fake()
    await syncHelp()
    const c = getDb().content
    expect(c.departments).toHaveLength(1)
    expect(c.articles[0].title).toBe('How do refunds work?')
    expect(c.crisisLines[0].phone).toBe('1199')
    expect(c.popular).toEqual(['a1'])
  })

  it('keeps the built-in help when the server can’t be reached', async () => {
    fake({ help_content: null })
    const before = getDb().content.departments.length
    await syncHelp()
    expect(getDb().content.departments).toHaveLength(before)
  })

  it('shows the member’s tickets from the server', async () => {
    fake()
    await syncTickets()
    expect(getDb().tickets).toHaveLength(1)
    expect(getDb().tickets[0].messages[1].from).toBe('staff')
  })
})

describe('writing in', () => {
  it('creates a ticket on the server and flags distress for the team', async () => {
    const calls = fake({ create_ticket: { ok: true, id: 't1', crisis: true } })
    const r = await remoteTickets.create({ deptId: 'billing', subject: 'Help', text: 'I do not want to live anymore' })
    expect(r.ok && r.value.ticket.id).toBe('t1')
    expect(calls[0].name).toBe('create_ticket')
    expect(calls[0].args).toMatchObject({ p_dept: 'billing', p_crisis: true })
  })

  it('passes the server’s refusal back', async () => {
    fake({ create_ticket: { ok: false, code: 'limit', error: 'You have sent several requests today.' } })
    expect(await remoteTickets.create({ deptId: 'billing', subject: 'x', text: 'a long enough message' })).toMatchObject({ ok: false, code: 'limit' })
  })

  it('replies, marks read and resolves through the server', async () => {
    const calls = fake()
    update({ tickets: [TICKET as never] })
    await remoteTickets.reply('t1', 'Thank you')
    remoteTickets.markRead('t1')
    remoteTickets.resolve('t1')
    expect(getDb().tickets[0].unread).toBe(false)
    expect(calls.map((c) => c.name)).toEqual(expect.arrayContaining(['reply_ticket', 'mark_ticket_read', 'resolve_ticket']))
  })

  it('suggests a service', async () => {
    const calls = fake()
    expect((await remoteSuggestService('Befrienders', 'A listening line')).ok).toBe(true)
    expect(calls[0]).toEqual({ name: 'suggest_service', args: { p_name: 'Befrienders', p_note: 'A listening line' } })
  })
})

describe('what staff do', () => {
  it('sees everything, including what is hidden from members, and the tickets for their departments', async () => {
    fake()
    await syncStaffHelp()
    expect(getDb().content.crisisVerifiedAt).toBe(5)
    expect(getDb().tickets[0].penName).toBe('QuietPine')
  })

  it('sends edits to the server and refreshes', async () => {
    const calls = fake()
    await remoteResources.saveArticle({ title: 'How do I get a receipt?', intro: 'Receipts are sent.', steps: ['Open Me'], deptId: 'billing' })
    await remoteResources.setPublished('a1', false)
    await remoteResources.saveDepartment('billing', { slaHours: 12 })
    await remoteResources.moveDepartment('billing', -1)
    await remoteResources.saveCrisisLine({ name: 'Line', phone: '1199', hours: '24h', languages: 'English' })
    await remoteResources.removeCrisisLine('cl1')
    await remoteResources.markVerified()
    await remoteResources.archiveOrg('o1', true)
    await remoteResources.decideSuggestion('sg1', true)
    await remoteResources.replyTicket('t1', 'We will refund you')
    await remoteResources.resolveTicket('t1')
    const sent = calls.filter((c) => c.name.startsWith('admin_') && c.name !== 'admin_help').map((c) => c.name)
    expect(sent).toEqual(['admin_save_article', 'admin_set_published', 'admin_save_department', 'admin_move_department', 'admin_save_crisis_line', 'admin_remove_crisis_line', 'admin_mark_verified', 'admin_archive_org', 'admin_decide_suggestion', 'admin_reply_ticket', 'admin_resolve_ticket'])
    expect(calls.find((c) => c.name === 'admin_save_department')?.args).toEqual({ p_id: 'billing', p_title: null, p_blurb: null, p_owner: null, p_sla: 12, p_enabled: null })
  })

  it('passes the server’s refusals back', async () => {
    fake({ admin_save_department: { ok: false, code: 'locked', error: 'Safety and reporting can’t be switched off.' } })
    expect(await remoteResources.saveDepartment('safety', { enabled: false })).toMatchObject({ ok: false, code: 'locked' })
  })
})

describe('reply notifications', () => {
  it('notes a staff reply once, however often tickets are read, with no content in it', async () => {
    update({ ...freshState(), account: { settings: { ...DEFAULT_SETTINGS } } } as never)
    fake()
    await syncTickets()
    await syncTickets()
    const notes = getDb().notifications.filter((n) => n.key === 't:t1:m2')
    expect(notes).toHaveLength(1)
    expect(notes[0].href).toBe('/help/ticket/t1')
    expect(JSON.stringify(notes[0])).not.toContain('Sorted')
  })

  it('says nothing for a ticket the member has already read', async () => {
    update({ ...freshState(), account: { settings: { ...DEFAULT_SETTINGS } } } as never)
    fake({ my_tickets: { ok: true, tickets: [{ ...TICKET, unread: false }] } })
    await syncTickets()
    expect(getDb().notifications).toHaveLength(0)
  })
})
