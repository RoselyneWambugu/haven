import type { Res } from '@/api/types'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
type Reply = { ok: boolean; error?: string; code?: string }

export type RuleReason = 'harassment' | 'threats' | 'self-harm' | 'sexual' | 'scam' | 'hate'
export interface FlagRule { id: number; category: string; reason: RuleReason; pattern: string; confidence: number; enabled: boolean }
export interface FlagRules { rules: FlagRule[]; blocked24h: number; blocked7d: number; blockedByKind: { phone: number; link: number; address: number } }
export interface FlagTest { flagged: boolean; category?: string; confidence?: number; reason?: string }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}

export async function loadFlagRules(): Promise<FlagRules | null> {
  const d = await call<Reply & Partial<FlagRules>>('admin_flag_rules')
  return d.ok && d.rules ? (d as FlagRules) : null
}

export async function saveFlagRule(r: { id: number | null; category: string; reason: RuleReason; pattern: string; confidence: number; enabled: boolean }): Promise<Res> {
  const d = await call('admin_save_flag_rule', { p_id: r.id, p_category: r.category, p_reason: r.reason, p_pattern: r.pattern, p_confidence: r.confidence, p_enabled: r.enabled })
  return d.ok ? { ok: true, value: undefined } : { ok: false, error: d.error ?? OFFLINE, code: d.code }
}

/** Tries some words against the live rules. Nothing is stored. */
export async function testFlagText(text: string): Promise<Res<FlagTest>> {
  const d = await call<Reply & Partial<FlagTest>>('admin_test_flag_text', { p_text: text })
  return d.ok ? { ok: true, value: { flagged: d.flagged === true, category: d.category, confidence: d.confidence, reason: d.reason } } : { ok: false, error: d.error ?? OFFLINE, code: d.code }
}
