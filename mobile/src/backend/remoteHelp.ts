import { resources as mockResources, suggestService as mockSuggest } from '@/api/content'
import { notify } from '@/api/notify'
import { tickets as mockTickets } from '@/api/support'
import type { ArticleCfg, ContentState, CrisisLineCfg, DepartmentCfg, Res, SupportOrgCfg, Ticket } from '@/api/types'
import { getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'

type Reply = { ok: boolean; error?: string; code?: string }
interface HelpReply extends Reply {
  departments?: DepartmentCfg[]
  articles?: ArticleCfg[]
  popular?: string[]
  emergency?: ContentState['emergency']
  crisisLines?: CrisisLineCfg[]
  crisisVerifiedAt?: number | null
  supportOrgs?: SupportOrgCfg[]
  suggestions?: ContentState['suggestions']
  tickets?: Ticket[]
}

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}
const res = (r: Reply): Res => (r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code })

/** The help content members see: open to anyone, signed in or not, because urgent help must always be reachable. */
export async function syncHelp(): Promise<void> {
  const d = await call<HelpReply>('help_content')
  if (!d.ok || !d.departments || !d.articles) return
  update((s) => ({
    content: { ...s.content, departments: d.departments!, articles: d.articles!, popular: d.popular ?? s.content.popular, emergency: d.emergency ?? s.content.emergency, crisisLines: d.crisisLines ?? s.content.crisisLines, supportOrgs: d.supportOrgs ?? s.content.supportOrgs },
  }))
}

/** The signed-in member's own help tickets. */
export async function syncTickets(): Promise<void> {
  const d = await call<HelpReply & { tickets?: Ticket[] }>('my_tickets')
  if (!d.ok || !d.tickets) return
  update({ tickets: d.tickets })
  // One note per staff reply that is still unread, however often this runs. The note names no one and shows nothing of the reply.
  for (const t of d.tickets) {
    const last = [...t.messages].reverse().find((m) => m.from === 'staff')
    if (t.unread && last) notify.push('message', `t:${t.id}:${last.id}`, 'Help has replied', 'Our team answered your message. Tap to read it.', `/help/ticket/${t.id}`)
  }
}

/** Staff see everything, including what is hidden from members, and the tickets for their departments. */
export async function syncStaffHelp(): Promise<void> {
  const d = await call<HelpReply>('admin_help')
  if (!d.ok || !d.departments) return
  update((s) => ({
    content: {
      ...s.content, departments: d.departments!, articles: d.articles ?? [], popular: d.popular ?? s.content.popular, emergency: d.emergency ?? s.content.emergency, crisisLines: d.crisisLines ?? [],
      crisisVerifiedAt: d.crisisVerifiedAt ?? null, supportOrgs: d.supportOrgs ?? [], suggestions: d.suggestions ?? [],
    },
    tickets: d.tickets ?? [],
  }))
}

// ---------- the member's side ----------

export const remoteTickets = {
  ...mockTickets,
  async create(input: { deptId: string; subject: string; text: string; crisis?: boolean }): Promise<Res<{ ticket: Ticket; crisis: boolean }>> {
    const { detectDistress } = await import('@/lib/safety')
    const risk = detectDistress(`${input.subject} ${input.text}`).level !== 'none'
    const r = await call<Reply & { id?: string; crisis?: boolean }>('create_ticket', { p_dept: input.deptId, p_subject: input.subject, p_text: input.text, p_crisis: risk })
    if (!r.ok || !r.id) return { ok: false, error: r.error ?? OFFLINE, code: r.code }
    await syncTickets()
    const ticket = getDb().tickets.find((t) => t.id === r.id)
    if (!ticket) return { ok: false, error: OFFLINE }
    return { ok: true, value: { ticket, crisis: r.crisis === true } }
  },
  async reply(id: string, text: string): Promise<Res> {
    const r = await call('reply_ticket', { p_id: id, p_text: text })
    await syncTickets()
    return res(r)
  },
  markRead(id: string): void {
    update((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, unread: false } : t)) }))
    void call('mark_ticket_read', { p_id: id })
  },
  resolve(id: string): void {
    update((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, status: 'resolved' as const, unread: false } : t)) }))
    void call('resolve_ticket', { p_id: id })
  },
}

export async function remoteSuggestService(name: string, note: string): Promise<Res> {
  const r = await call('suggest_service', { p_name: name, p_note: note })
  if (r.ok) showToast('Thank you. Our clinical team will take a look.')
  return res(r)
}

// ---------- staff ----------

async function act(fn: string, args: Record<string, unknown>): Promise<Res> {
  const r = await call(fn, args)
  await syncStaffHelp()
  return res(r)
}

export const remoteResources = {
  ...mockResources,
  replyTicket: (id: string, text: string) => act('admin_reply_ticket', { p_id: id, p_text: text }),
  resolveTicket: (id: string) => act('admin_resolve_ticket', { p_id: id }),
  async saveArticle(input: { id?: string; title: string; intro: string; steps: string[]; deptId: string; published?: boolean }): Promise<Res<{ id: string }>> {
    const r = await call<Reply & { id?: string }>('admin_save_article', { p_id: input.id ?? null, p_dept: input.deptId, p_title: input.title, p_intro: input.intro, p_steps: input.steps, p_published: input.published ?? null })
    await syncStaffHelp()
    return r.ok ? { ok: true, value: { id: r.id ?? '' } } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
  },
  setPublished: (id: string, published: boolean) => act('admin_set_published', { p_id: id, p_published: published }),
  saveDepartment: (id: string, change: Partial<Pick<DepartmentCfg, 'title' | 'blurb' | 'owner' | 'slaHours' | 'enabled'>>) =>
    act('admin_save_department', { p_id: id, p_title: change.title ?? null, p_blurb: change.blurb ?? null, p_owner: change.owner ?? null, p_sla: change.slaHours ?? null, p_enabled: change.enabled ?? null }),
  moveDepartment: (id: string, dir: -1 | 1) => act('admin_move_department', { p_id: id, p_dir: dir }),
  saveCrisisLine: (line: Pick<CrisisLineCfg, 'name' | 'phone' | 'hours' | 'languages'> & { id?: string }) =>
    act('admin_save_crisis_line', { p_id: line.id ?? null, p_name: line.name, p_phone: line.phone, p_hours: line.hours, p_languages: line.languages }),
  removeCrisisLine: (id: string) => act('admin_remove_crisis_line', { p_id: id }),
  markVerified: () => act('admin_mark_verified', {}),
  saveOrg: (org: Pick<SupportOrgCfg, 'name' | 'type' | 'cost' | 'hours' | 'languages' | 'action' | 'value'> & { id?: string }) =>
    act('admin_save_org', { p_id: org.id ?? null, p_name: org.name, p_type: org.type, p_cost: org.cost, p_hours: org.hours, p_languages: org.languages, p_action: org.action, p_value: org.value }),
  archiveOrg: (id: string, archived: boolean) => act('admin_archive_org', { p_id: id, p_archived: archived }),
  decideSuggestion: (id: string, accept: boolean) => act('admin_decide_suggestion', { p_id: id, p_accept: accept }),
}

export { mockSuggest }
