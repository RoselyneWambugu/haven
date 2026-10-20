import { now } from '@/lib/clock'
import { uid } from '@/lib/id'
import { applyStaffChange, describeChange } from '@/lib/roles'
import { emptyExposure, mondayStart, nextRota, validateWellbeing, WEEK, weekOf } from '@/lib/wellbeing'
import { getDb, update } from '@/store/db'
import { log, me } from './admin'
import type { AdminState, Res, StaffChange, WellbeingCfg } from './types'

function patch(fn: (a: AdminState) => Partial<AdminState>) {
  update((s) => (s.admin ? { admin: { ...s.admin, ...fn(s.admin) } } : {}))
}
const admin = (): AdminState => getDb().admin!
const denied = <T = void>(what: string): Res<T> => ({ ok: false, error: `Your role can’t ${what}.`, code: 'role' })
const isAdmin = (): boolean => me().role === 'admin'

/**
 * Roles and permissions, and reviewer wellbeing (PRD §3.2, RBAC-1, RBAC-2, ADM-5). Changing who is on the team is a
 * sensitive change, so a second Admin approves it. Everyone signs in with a second factor, and that can't be turned off.
 */
export const team = {
  // --- the roster ---
  proposeStaff(change: StaffChange): Res {
    const { name } = me()
    if (!isAdmin()) return denied('change the team')
    if (admin().pendingStaff) return { ok: false, error: 'A change is already waiting for approval. Approve or withdraw it first.', code: 'pending' }
    const tried = applyStaffChange(admin().staff, change, name, 'preview')
    if ('error' in tried) return { ok: false, error: tried.error, code: 'invalid' }
    patch(() => ({ pendingStaff: { change, requestedBy: name } }))
    log('Proposed team change', 'Team', describeChange(change, admin().staff))
    return { ok: true, value: undefined }
  },
  approveStaff(): Res {
    const { name } = me()
    const pending = admin().pendingStaff
    if (!isAdmin() || !pending) return { ok: false, error: 'There is nothing to approve.' }
    if (pending.requestedBy === name) return { ok: false, error: 'A second admin has to approve this.', code: 'second-person' }
    const applied = applyStaffChange(admin().staff, pending.change, pending.requestedBy, uid('st'))
    if ('error' in applied) {
      patch(() => ({ pendingStaff: null }))
      return { ok: false, error: applied.error, code: 'invalid' }
    }
    const what = describeChange(pending.change, admin().staff)
    patch(() => ({ staff: applied.staff, pendingStaff: null }))
    log('Approved team change', 'Team', what)
    return { ok: true, value: undefined }
  },
  withdrawStaff(): void {
    patch(() => ({ pendingStaff: null }))
  },

  // --- wellbeing (ADM-5) ---
  setWellbeing(cfg: WellbeingCfg): Res {
    if (!isAdmin()) return denied('change wellbeing limits')
    const problem = validateWellbeing(cfg)
    if (problem) return { ok: false, error: problem, code: 'invalid' }
    patch(() => ({ wellbeing: cfg }))
    log('Changed wellbeing limits', 'Wellbeing', `${cfg.dailyLimit} a day, break every ${cfg.breakEvery}, ${cfg.breakMinutes} min`)
    return { ok: true, value: undefined }
  },
  /** A break pauses revealing for the chosen time, and resets the count since the last break. */
  startBreak(): Res {
    const { name } = me()
    const e = admin().exposure[name] ?? emptyExposure()
    patch((a) => ({ exposure: { ...a.exposure, [name]: { ...e, sinceBreak: 0, breakUntil: now() + a.wellbeing.breakMinutes * 60_000 } } }))
    log('Started a break', 'Wellbeing')
    return { ok: true, value: undefined }
  },
  endBreak(): void {
    const { name } = me()
    const e = admin().exposure[name]
    if (e) patch((a) => ({ exposure: { ...a.exposure, [name]: { ...e, breakUntil: null } } }))
  },
  /** Makes sure this week and the next have a rota, rotating people who were not on the heavy queue last week to the front. */
  ensureRota(): void {
    const a = admin()
    const mods = a.staff.filter((s) => s.active && s.role === 'moderator').map((s) => s.name)
    let rota = [...a.rota]
    let changed = false
    for (const start of [mondayStart(now()), mondayStart(now()) + WEEK]) {
      if (rota.some((r) => r.weekStart === start)) continue
      const prev = rota.filter((r) => r.weekStart < start).sort((x, y) => y.weekStart - x.weekStart)[0]
      rota = [...rota, { weekStart: start, heavy: nextRota(prev?.heavy ?? [], mods, Math.max(1, prev?.heavy.length ?? 1)) }]
      changed = true
    }
    if (changed) patch(() => ({ rota }))
  },
  setRota(weekStart: number, heavy: string[]): Res {
    if (!isAdmin()) return denied('change the rota')
    const mods = admin().staff.filter((s) => s.active && s.role === 'moderator').map((s) => s.name)
    if (!heavy.length) return { ok: false, error: 'Put at least one moderator on the heavy queue.', code: 'invalid' }
    if (heavy.some((h) => !mods.includes(h))) return { ok: false, error: 'Only active moderators can be on the heavy queue.', code: 'invalid' }
    const prev = admin().rota.find((r) => r.weekStart === weekStart - WEEK)
    if (prev && mods.length > heavy.length && heavy.every((h) => prev.heavy.includes(h))) return { ok: false, error: 'The same people can’t work the heavy queue two weeks running. Rotate at least one person.', code: 'rotate' }
    patch((a) => ({ rota: a.rota.some((r) => r.weekStart === weekStart) ? a.rota.map((r) => (r.weekStart === weekStart ? { ...r, heavy } : r)) : [...a.rota, { weekStart, heavy }] }))
    log('Changed the heavy-queue rota', 'Wellbeing', heavy.join(', '))
    return { ok: true, value: undefined }
  },
  /** A way to step back: hand a case you own to a colleague, with no questions asked. */
  handOn(caseId: string): Res {
    const { name } = me()
    const c = admin().cases.find((x) => x.id === caseId)
    if (!c || c.owner !== name) return { ok: false, error: 'You can only hand on a case you own.', code: 'owner' }
    patch((a) => ({ cases: a.cases.map((x) => (x.id === caseId ? { ...x, owner: null, status: 'new' } : x)) }))
    log('Handed a case on', caseId)
    return { ok: true, value: undefined }
  },
  /** Logged without a reason, so no one has to explain why they asked. */
  askForSupport(): void {
    log('Asked for wellbeing support', 'Wellbeing')
  },
  currentRota: (): string[] => weekOf(admin().rota, now())?.heavy ?? [],
}
