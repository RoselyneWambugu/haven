import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { loadFlagRules, saveFlagRule, testFlagText } from '../src/backend/remoteFlagRules'

function fake(replies: Record<string, unknown> = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  setClient({ rpc: async (name: string, args?: Record<string, unknown>) => (calls.push({ name, args }), { data: name in replies ? replies[name] : { ok: true }, error: null }) } as unknown as SupabaseClient)
  return calls
}
afterEach(() => setClient(null))

describe('flag rules', () => {
  it('reads the rules and what the contact filter stopped', async () => {
    fake({ admin_flag_rules: { ok: true, rules: [{ id: 1, category: 'Harassment', reason: 'harassment', pattern: 'x', confidence: 0.7, enabled: true }], blocked24h: 3, blocked7d: 9, blockedByKind: { phone: 5, link: 3, address: 1 } } })
    const d = await loadFlagRules()
    expect(d?.rules).toHaveLength(1)
    expect(d?.blocked7d).toBe(9)
  })

  it('has nothing to show when offline or not allowed', async () => {
    fake({ admin_flag_rules: { ok: false, code: 'role' } })
    expect(await loadFlagRules()).toBeNull()
  })

  it('saves a rule and shows the server’s reason when it is refused', async () => {
    const calls = fake()
    expect((await saveFlagRule({ id: null, category: 'Free airtime', reason: 'scam', pattern: 'free airtime', confidence: 0.7, enabled: true })).ok).toBe(true)
    expect(calls[0].args).toEqual({ p_id: null, p_category: 'Free airtime', p_reason: 'scam', p_pattern: 'free airtime', p_confidence: 0.7, p_enabled: true })
    fake({ admin_save_flag_rule: { ok: false, code: 'pattern', error: 'That pattern matches everything. Make it more specific.' } })
    const r = await saveFlagRule({ id: 3, category: 'Bad', reason: 'scam', pattern: '.*', confidence: 0.7, enabled: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('pattern')
  })

  it('tries some words against the rules', async () => {
    fake({ admin_test_flag_text: { ok: true, flagged: true, category: 'Scam / money', confidence: 0.88, reason: 'scam' } })
    const r = await testFlagText('send me money')
    expect(r.ok && r.value.flagged).toBe(true)
    fake({ admin_test_flag_text: { ok: true, flagged: false } })
    const q = await testFlagText('hello')
    expect(q.ok && q.value.flagged).toBe(false)
  })
})
