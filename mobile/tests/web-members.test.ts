import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The hosted website: the live service, in a browser. Members have no screens there; therapists and staff sign in as usual. */
async function load() {
  vi.stubEnv('EXPO_PUBLIC_BACKEND', 'supabase')
  vi.resetModules()
  const web = await import('../src/lib/webMembers')
  const client = await import('../src/backend/client')
  const auth = await import('../src/backend/remoteAuth')
  const db = await import('../src/store/db')
  const polling = await import('../src/backend/remoteChat')
  const portal = await import('../src/backend/remotePortal')
  return { web, client, auth: auth.remoteAuth, db, polling, portal }
}

function fake(o: { member?: boolean; therapist?: boolean } = {}) {
  const calls: string[] = []
  const PORTAL = {
    ok: true, therapist_id: 't-amina', paused: false, caps: { dailySessions: 6, newClientsPerWeek: 4 },
    profile: { name: 'Dr. Amina', title: 'Counsellor', bio: 'Hello.', specialisations: [], languages: [], modes: ['chat'], priceKes: 1500, acceptingNew: true },
    availability: [], time_off: [], payout: { method: '', schedule: 'weekly' }, licence_valid_to: 1893456000000, sessions: [], threads: [], concerns: [],
  }
  const MEMBER = {
    id: 'm1', standing: 'good', has_posted_before: false, deletion_requested_at: null, trusted_device: true, shared_device: false, mood: null, settings: {}, created_at: '2026-10-21T08:00:00Z',
    public: { pen_name: 'QuietPine', avatar: 'moon', languages: ['English'], topics: [], age_band: '25-34', open_to_chats: true, pen_name_changed_at: null },
    private: { full_name: 'Wanjiru Kamau', phone: null, email: 'w@example.com', date_of_birth: '1995-05-05', id_verified: false },
    consents: { version: '2026-10', terms: true, privacy: true, guidelines: true, moderation: true, at: '2026-10-21T08:00:00Z' }, devices: [],
  }
  return {
    calls,
    client: {
      auth: {
        signInWithPassword: async () => ({ error: null }),
        getUser: async () => ({ data: { user: { id: 'u1', email: 'w@example.com', user_metadata: {}, identities: [] } } }),
        signOut: async () => (calls.push('signOut'), { error: null }),
      },
      rpc: async (name: string) => {
        calls.push(name)
        if (name === 'my_account') return { data: o.member ? MEMBER : null, error: null }
        if (name === 'my_portal') return { data: o.therapist ? PORTAL : { ok: false }, error: null }
        return { data: { ok: false }, error: null }
      },
    } as unknown as SupabaseClient,
  }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('the website without members', () => {
  it('turns member screens off on the live website, and keeps them in the demo', async () => {
    const m = await load()
    expect(m.web.MEMBERS_ON_WEB).toBe(false)
    expect(m.web.WEB_PAGES.has('portal') && m.web.WEB_PAGES.has('admin') && m.web.WEB_PAGES.has('landing') && m.web.WEB_PAGES.has('urgent')).toBe(true)
    for (const member of ['login', 'register', 'consent', 'home', 'chat', 'welcome']) expect(m.web.WEB_PAGES.has(member)).toBe(false)
    vi.unstubAllEnvs()
    vi.resetModules()
    expect((await import('../src/lib/webMembers')).MEMBERS_ON_WEB).toBe(true)
  })

  it('sends a member who signs in on the website to the app and keeps no member session', async () => {
    const m = await load()
    const f = fake({ member: true })
    m.client.setClient(f.client)
    expect(await m.auth.signInWithEmail('w@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'mobile-app' } })
    expect(f.calls).toContain('signOut')
    expect(m.db.getDb().signedIn).toBe(false)
    expect(m.db.getDb().account).toBeNull()
  })

  it('does the same for a stranger who would have registered', async () => {
    const m = await load()
    const f = fake()
    m.client.setClient(f.client)
    expect(await m.auth.signInWithEmail('w@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'mobile-app' } })
    expect(m.db.getDb().reg).toBeNull()
  })

  it('still opens the portal for a therapist, even one who also has a member account', async () => {
    const m = await load()
    const f = fake({ member: true, therapist: true })
    m.client.setClient(f.client)
    expect(await m.auth.signInWithEmail('w@example.com', 'quiet-river-42', 'portal')).toEqual({ ok: true, value: { next: 'portal' } })
    expect(await m.auth.signInWithEmail('w@example.com', 'quiet-river-42')).toEqual({ ok: true, value: { next: 'portal' } })
    m.portal.stopPortalPolling()
    m.polling.stopPolling()
  })
})
