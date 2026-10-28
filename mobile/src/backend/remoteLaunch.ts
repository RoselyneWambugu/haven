import type { Res } from '@/api/types'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

export interface LaunchItem { id: string; group: string; label: string; state: 'ok' | 'todo'; detail: string; manual?: boolean }
export interface Launch { items: LaunchItem[]; ready: boolean }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}

/** The Admin's checklist, worked out from the live system. Null when offline or not an Admin. */
export async function loadLaunch(): Promise<Launch | null> {
  const d = await call<Reply & Partial<Launch>>('admin_launch')
  return d.ok && d.items ? { items: d.items, ready: d.ready === true } : null
}

/** Confirms (or reopens) an item only a person can check. */
export async function signOff(item: string, done: boolean, note: string): Promise<Res> {
  const r = await call('admin_launch_signoff', { p_item: item, p_done: done, p_note: note })
  return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
}
