import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import {
  canEditConfig, canEditDepartments, canEditDirectory, ownsDepartment, slugify, validateArticle, validateLimits, validateLine, validateMatching, validatePlans, validateTopic, type ArticleInput,
} from '@/lib/content'
import { applyLimits, getDb, update } from '@/store/db'
import { showToast } from '@/store/toast'
import { log, me } from './admin'
import type { ArticleCfg, ContentState, CrisisLineCfg, DepartmentCfg, FlagsCfg, LimitsCfg, MatchingCfg, PlanCfg, Res, SupportOrgCfg } from './types'

function patch(fn: (c: ContentState) => Partial<ContentState>) {
  update((s) => ({ content: { ...s.content, ...fn(s.content) } }))
}
const content = (): ContentState => getDb().content
const denied = <T = void>(what: string): Res<T> => ({ ok: false, error: `Your role can’t ${what}.`, code: 'role' })

/**
 * The staff side of Resources and Configuration. Every change is limited by role and written to the audit log.
 * The member app reads the same content, so a change shows up there straight away (PRD HLP-1: editable without a release).
 */
export const resources = {
  // --- tickets (HLP-1a, HLP-7) ---
  /** Staff reply as "Echo staff", never as a named person. */
  replyTicket(id: string, text: string): Res {
    const { role } = me()
    const t = getDb().tickets.find((x) => x.id === id)
    if (!t) return { ok: false, error: 'Ticket not found.' }
    const dept = content().departments.find((d) => d.id === t.deptId)
    if (!ownsDepartment(role, dept)) return denied('answer tickets for this department')
    const msg = text.trim()
    if (msg.length < 3) return { ok: false, error: 'Write a reply first.', code: 'empty' }
    update((s) => ({
      tickets: s.tickets.map((x) => (x.id === id ? { ...x, status: 'replied', unread: true, messages: [...x.messages, { id: uid('tm'), from: 'staff', text: msg, at: now() }] } : x)),
    }))
    log('Replied to ticket', id, dept?.title ?? '')
    return { ok: true, value: undefined }
  },
  resolveTicket(id: string): Res {
    const { role } = me()
    const t = getDb().tickets.find((x) => x.id === id)
    if (!t) return { ok: false, error: 'Ticket not found.' }
    if (!ownsDepartment(role, content().departments.find((d) => d.id === t.deptId))) return denied('close tickets for this department')
    update((s) => ({ tickets: s.tickets.map((x) => (x.id === id ? { ...x, status: 'resolved', unread: true } : x)) }))
    log('Resolved ticket', id)
    return { ok: true, value: undefined }
  },

  // --- articles (HLP-5) ---
  saveArticle(input: ArticleInput & { id?: string; published?: boolean }): Res<{ id: string }> {
    const { role } = me()
    const dept = content().departments.find((d) => d.id === input.deptId)
    if (!ownsDepartment(role, dept)) return denied('edit articles in this department')
    const problem = validateArticle(input)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    const steps = input.steps.map((s) => s.trim()).filter(Boolean)
    const existing = input.id ? content().articles.find((a) => a.id === input.id) : undefined
    if (existing && !ownsDepartment(role, content().departments.find((d) => d.id === existing.deptId))) return denied('edit this article')
    const id = existing?.id ?? slugify(input.title, content().articles.map((a) => a.id))
    const next: ArticleCfg = { id, deptId: input.deptId, title: input.title.trim(), intro: input.intro.trim(), steps, updatedAt: now(), related: existing?.related ?? [], published: input.published ?? existing?.published ?? true }
    patch((c) => ({ articles: existing ? c.articles.map((a) => (a.id === id ? next : a)) : [...c.articles, next] }))
    log(existing ? 'Edited article' : 'Added article', id)
    return { ok: true, value: { id } }
  },
  setPublished(id: string, published: boolean): Res {
    const { role } = me()
    const a = content().articles.find((x) => x.id === id)
    if (!a) return { ok: false, error: 'Article not found.' }
    if (!ownsDepartment(role, content().departments.find((d) => d.id === a.deptId))) return denied('change this article')
    patch((c) => ({ articles: c.articles.map((x) => (x.id === id ? { ...x, published, updatedAt: now() } : x)) }))
    log(published ? 'Published article' : 'Unpublished article', id)
    return { ok: true, value: undefined }
  },

  // --- departments (HLP-1) ---
  saveDepartment(id: string, change: Partial<Pick<DepartmentCfg, 'title' | 'blurb' | 'owner' | 'slaHours' | 'enabled'>>): Res {
    if (!canEditDepartments(me().role)) return denied('change departments')
    const d = content().departments.find((x) => x.id === id)
    if (!d) return { ok: false, error: 'Department not found.' }
    if (change.title !== undefined && change.title.trim().length < 3) return { ok: false, error: 'A department needs a name.', code: 'invalid' }
    if (change.slaHours !== undefined && (!Number.isInteger(change.slaHours) || change.slaHours < 1 || change.slaHours > 168)) return { ok: false, error: 'A response target is 1 to 168 hours.', code: 'invalid' }
    if (change.enabled === false && id === 'safety') return { ok: false, error: 'Safety and reporting can’t be switched off.', code: 'locked' }
    patch((c) => ({ departments: c.departments.map((x) => (x.id === id ? { ...x, ...change } : x)) }))
    log('Changed department', id, Object.keys(change).join(', '))
    return { ok: true, value: undefined }
  },
  moveDepartment(id: string, dir: -1 | 1): Res {
    if (!canEditDepartments(me().role)) return denied('change departments')
    const list = [...content().departments]
    const i = list.findIndex((x) => x.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return { ok: true, value: undefined }
    ;[list[i], list[j]] = [list[j], list[i]]
    patch(() => ({ departments: list }))
    log('Reordered departments', id)
    return { ok: true, value: undefined }
  },

  // --- crisis lines and support directory (CRS-2, HLP-2, HLP-9) ---
  saveCrisisLine(line: Pick<CrisisLineCfg, 'name' | 'phone' | 'hours' | 'languages'> & { id?: string }): Res {
    if (!canEditDirectory(me().role)) return denied('edit crisis lines')
    const problem = validateLine(line)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    const id = line.id ?? uid('cl')
    const next: CrisisLineCfg = { id, name: line.name.trim(), phone: line.phone.trim(), hours: line.hours.trim(), languages: line.languages.trim() }
    patch((c) => ({ crisisLines: c.crisisLines.some((l) => l.id === id) ? c.crisisLines.map((l) => (l.id === id ? next : l)) : [...c.crisisLines, next], crisisVerifiedAt: null }))
    log(line.id ? 'Edited crisis line' : 'Added crisis line', next.name)
    return { ok: true, value: undefined }
  },
  removeCrisisLine(id: string): Res {
    if (!canEditDirectory(me().role)) return denied('edit crisis lines')
    patch((c) => ({ crisisLines: c.crisisLines.filter((l) => l.id !== id) }))
    log('Removed crisis line', id)
    return { ok: true, value: undefined }
  },
  /** A Clinical Reviewer confirms the numbers. They can't be confirmed while one is still blank. Editing a line clears this. */
  markVerified(): Res {
    if (!canEditDirectory(me().role)) return denied('verify crisis lines')
    const c = content()
    if (!c.emergency.phone.trim() || c.crisisLines.some((l) => !l.phone.trim())) return { ok: false, error: 'Add every number before marking them as checked.', code: 'blank' }
    patch(() => ({ crisisVerifiedAt: now() }))
    log('Verified crisis lines', 'Urgent help', `${c.crisisLines.length + 1} numbers`)
    return { ok: true, value: undefined }
  },
  saveOrg(org: Pick<SupportOrgCfg, 'name' | 'type' | 'cost' | 'hours' | 'languages' | 'action' | 'value'> & { id?: string }): Res {
    if (!canEditDirectory(me().role)) return denied('edit the directory')
    if (org.name.trim().length < 3) return { ok: false, error: 'Add the name of the organisation.', code: 'invalid' }
    const id = org.id ?? uid('o')
    const existing = content().supportOrgs.find((o) => o.id === id)
    const next: SupportOrgCfg = { id, name: org.name.trim(), type: org.type, cost: org.cost.trim(), hours: org.hours.trim(), languages: org.languages.trim(), action: org.action, value: org.value.trim(), archived: existing?.archived ?? false }
    patch((c) => ({ supportOrgs: existing ? c.supportOrgs.map((o) => (o.id === id ? next : o)) : [...c.supportOrgs, next] }))
    log(existing ? 'Edited organisation' : 'Added organisation', next.name)
    return { ok: true, value: undefined }
  },
  archiveOrg(id: string, archived: boolean): Res {
    if (!canEditDirectory(me().role)) return denied('edit the directory')
    patch((c) => ({ supportOrgs: c.supportOrgs.map((o) => (o.id === id ? { ...o, archived } : o)) }))
    log(archived ? 'Archived organisation' : 'Restored organisation', id)
    return { ok: true, value: undefined }
  },
  decideSuggestion(id: string, accept: boolean): Res {
    if (!canEditDirectory(me().role)) return denied('review suggestions')
    const s = content().suggestions.find((x) => x.id === id)
    if (!s || s.status !== 'new') return { ok: false, error: 'This suggestion has been handled.' }
    patch((c) => ({
      suggestions: c.suggestions.map((x) => (x.id === id ? { ...x, status: accept ? 'accepted' : 'declined' } : x)),
      supportOrgs: accept ? [...c.supportOrgs, { id: uid('o'), name: s.name, type: 'Counselling', cost: '', hours: '', languages: '', action: 'contact', value: '', archived: true }] : c.supportOrgs,
    }))
    log(accept ? 'Accepted service suggestion' : 'Declined service suggestion', s.name)
    return { ok: true, value: undefined }
  },
}

/** The member side of the directory: suggest a service for the clinical team to review (HLP-9). */
export function suggestService(name: string, note: string): Res {
  const n = name.trim()
  if (n.length < 3) return { ok: false, error: 'Tell us the name of the service.', code: 'invalid' }
  patch((c) => ({ suggestions: [...c.suggestions, { id: uid('sg'), name: n, note: note.trim().slice(0, 300), at: now(), status: 'new' }] }))
  showToast('Thank you. Our clinical team will take a look.')
  return { ok: true, value: undefined }
}

export const config = {
  // --- issue taxonomy: the community topics ---
  addTopic(name: string): Res {
    if (!canEditConfig(me().role)) return denied('change topics')
    const problem = validateTopic(name, content().topics)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    patch((c) => ({ topics: [...c.topics, name.trim()] }))
    log('Added topic', name.trim())
    return { ok: true, value: undefined }
  },
  /** Renaming carries existing posts and members’ chosen topics with it. */
  renameTopic(from: string, to: string): Res {
    if (!canEditConfig(me().role)) return denied('change topics')
    const problem = validateTopic(to, content().topics.filter((t) => t !== from))
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    const next = to.trim()
    patch((c) => ({ topics: c.topics.map((t) => (t === from ? next : t)) }))
    update((s) => ({
      posts: s.posts.map((p) => (p.topic === from ? { ...p, topic: next } : p)),
      account: s.account ? { ...s.account, public: { ...s.account.public, topics: s.account.public.topics.map((t) => (t === from ? next : t)) } } : s.account,
    }))
    log('Renamed topic', `${from} to ${next}`)
    return { ok: true, value: undefined }
  },
  /** Retiring hides a topic from new posts. Existing posts keep it. */
  retireTopic(name: string): Res {
    if (!canEditConfig(me().role)) return denied('change topics')
    if (content().topics.length <= 3) return { ok: false, error: 'Keep at least three topics.', code: 'min' }
    patch((c) => ({ topics: c.topics.filter((t) => t !== name) }))
    log('Retired topic', name)
    return { ok: true, value: undefined }
  },

  // --- plans and entitlements: money, so two admins (BIL-1, BIL-2) ---
  proposePlans(plans: PlanCfg[]): Res {
    const { name, role } = me()
    if (!canEditConfig(role)) return denied('change plans')
    const problem = validatePlans(plans)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    patch(() => ({ pendingPlans: { plans, requestedBy: name, approvals: [] } }))
    log('Proposed plan change', 'Plans')
    return { ok: true, value: undefined }
  },
  approvePlans(): Res {
    const { name, role } = me()
    const pending = content().pendingPlans
    if (!canEditConfig(role) || !pending) return { ok: false, error: 'There is nothing to approve.' }
    if (pending.requestedBy === name) return { ok: false, error: 'A second admin has to approve this.', code: 'second-person' }
    patch(() => ({ plans: pending.plans, pendingPlans: null }))
    log('Approved plan change', 'Plans')
    return { ok: true, value: undefined }
  },
  withdrawPlans(): void {
    patch(() => ({ pendingPlans: null }))
  },

  // --- matching (MAT-1, MAT-7) ---
  setMatching(m: MatchingCfg): Res {
    if (!canEditConfig(me().role)) return denied('change matching')
    const problem = validateMatching(m)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    patch(() => ({ matching: m }))
    log('Changed matching', 'Matching', `topics ${m.softTopicWeight}, wait ${m.rematchCooldownDays} d, neighbours ${m.neighbourFallback ? 'on' : 'off'}`)
    return { ok: true, value: undefined }
  },

  // --- feature flags and limits ---
  setFlag(key: keyof FlagsCfg, on: boolean): Res {
    if (!canEditConfig(me().role)) return denied('change feature flags')
    patch((c) => ({ flags: { ...c.flags, [key]: on } }))
    log(on ? 'Turned on feature' : 'Turned off feature', key)
    return { ok: true, value: undefined }
  },
  setLimits(l: LimitsCfg): Res {
    if (!canEditConfig(me().role)) return denied('change limits')
    const problem = validateLimits(l)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    patch(() => ({ limits: l }))
    applyLimits()
    log('Changed limits', 'Limits', `grace ${l.graceDays} d, pen name ${l.penNameChangeDays} d, deletion ${l.deletionHoldDays} d`)
    return { ok: true, value: undefined }
  },
}
