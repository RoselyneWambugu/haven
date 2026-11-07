import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { setClient } from '../src/backend/client'
import { remoteAccountActions } from '../src/backend/remoteAuth'
import { validateDetailsEdit } from '../src/lib/identity'
import { resetClock } from '../src/lib/clock'
import { freshState, getDb, update } from '../src/store/db'

const cur = { fullName: 'Amina Wairimu', email: '', penName: 'RiverMoss', emailIsSignIn: false }

describe('checking an edit to the name and email', () => {
  it('accepts a normal change', () => expect(validateDetailsEdit({ fullName: 'Amina Njeri Wairimu', email: 'amina@example.com' }, cur)).toBeNull())
  it('wants a name, and an email that looks like one (or none)', () => {
    expect(validateDetailsEdit({ fullName: 'A', email: '' }, cur)).toMatch(/full name/)
    expect(validateDetailsEdit({ fullName: 'Amina Wairimu', email: 'nope' }, cur)).toMatch(/email/)
    expect(validateDetailsEdit({ fullName: 'Amina Wairimu', email: '' }, cur)).toBeNull()
  })
  it('keeps a part of the pen name out of the real name', () => {
    expect(validateDetailsEdit({ fullName: 'Amina River Moss', email: '' }, cur)).toMatch(/pen name/)
    expect(validateDetailsEdit({ fullName: 'Amina Wairimu', email: '' }, { ...cur, fullName: 'Amina Wairimu' })).toBeNull()
  })
  it('sends a sign-in email to Sign-in methods', () => {
    const c = { ...cur, email: 'amina@example.com', emailIsSignIn: true }
    expect(validateDetailsEdit({ fullName: 'Amina Wairimu', email: 'other@example.com' }, c)).toMatch(/Sign-in methods/)
    expect(validateDetailsEdit({ fullName: 'Amina N Wairimu', email: 'AMINA@example.com' }, c)).toBeNull()
  })
})

describe('editing the profile in the app', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    api.auth.submitDetails({ fullName: 'Amina Otieno', dob: '14/03/1998', email: 'amina@example.com', password: 'Fern2026a' })
    api.auth.acceptConsents()
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
    api.auth.completeRegistration('web')
  })

  it('changes the name and email, never the date of birth, and marks a verified ID unverified when the name changes', () => {
    update((s) => ({ account: { ...s.account!, private: { ...s.account!.private, idVerified: true } } }))
    const dob = getDb().account!.private.dob
    expect(api.account.updateDetails({ fullName: 'Amina Njeri Otieno', email: 'amina@example.com' }).ok).toBe(true)
    const p = getDb().account!.private
    expect(p).toMatchObject({ fullName: 'Amina Njeri Otieno', email: 'amina@example.com', idVerified: false, dob })
    expect(api.account.updateDetails({ fullName: 'Amina Njeri Otieno', email: '' }).ok).toBe(true)
  })

  it('keeps a verified ID when only the email changes', () => {
    update((s) => ({ account: { ...s.account!, private: { ...s.account!.private, idVerified: true } } }))
    api.account.updateDetails({ fullName: 'Amina Otieno', email: 'amina@example.com' })
    expect(getDb().account!.private.idVerified).toBe(true)
  })

  it('refuses a name with part of the pen name in it, and an email that is the way in', () => {
    expect(api.account.updateDetails({ fullName: 'Amina Quiet Otieno', email: '' })).toMatchObject({ ok: false, code: 'invalid' })
    update((s) => ({ account: { ...s.account!, hasGoogle: true, private: { ...s.account!.private, email: 'amina@example.com' } } }))
    expect(api.account.updateDetails({ fullName: 'Amina Otieno', email: 'other@example.com' })).toMatchObject({ ok: false, code: 'invalid' })
  })
})

describe('editing the profile on the real backend', () => {
  afterEach(() => setClient(null))

  it('sends the edit, then reads the account back', async () => {
    update({ account: { id: 'u1', private: { fullName: 'Amina Wairimu', email: '', phone: '+254712345678', dob: '1996-06-06', idVerified: false }, public: { penName: 'RiverMoss' } } as never })
    const calls: { name: string; args?: Record<string, unknown> }[] = []
    setClient({ rpc: async (name: string, args?: Record<string, unknown>) => (calls.push({ name, args }), { data: name === 'my_account' ? null : { ok: true }, error: null }) } as unknown as SupabaseClient)
    const r = await remoteAccountActions.updateDetails({ fullName: ' Amina Njeri Wairimu ', email: 'amina@example.com' })
    expect(r.ok).toBe(true)
    expect(calls[0]).toEqual({ name: 'update_my_details', args: { p_full_name: 'Amina Njeri Wairimu', p_email: 'amina@example.com' } })
  })

  it('shows the server’s reason', async () => {
    update({ account: { id: 'u1', private: { fullName: 'Amina Wairimu', email: '', phone: '+254712345678', dob: '1996-06-06', idVerified: false }, public: { penName: 'RiverMoss' } } as never })
    setClient({ rpc: async () => ({ data: { ok: false, code: 'name', error: 'Part of that name is in your pen name.' }, error: null }) } as unknown as SupabaseClient)
    expect(await remoteAccountActions.updateDetails({ fullName: 'Amina Njeri Wairimu', email: '' })).toMatchObject({ ok: false, error: 'Part of that name is in your pen name.' })
  })
})
