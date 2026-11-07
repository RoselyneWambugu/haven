import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { adminMfaEnroll, adminMfaFactor, adminMfaVerify, adminVerifyOtp, adminRequestOtp, stopAdminPolling, isStaff } from '../src/backend/remoteAdmin'
import { stopPolling } from '../src/backend/remoteChat'
import { freshState, update } from '../src/store/db'
import { resetClock } from '../src/lib/clock'

interface Script { staffMe: unknown; verifyOk?: boolean; factors?: { totp: { id: string }[]; all: { id: string; status: string }[] } }

function fake(script: Script) {
  const log = { unenrolled: [] as string[], verified: [] as { factorId: string; code: string }[], signedOut: 0 }
  setClient({
    auth: {
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
      signOut: async () => ((log.signedOut += 1), { error: null }),
      getSession: async () => ({ data: { session: {} } }),
      mfa: {
        listFactors: async () => ({ data: script.factors ?? { totp: [], all: [] } }),
        unenroll: async ({ factorId }: { factorId: string }) => (log.unenrolled.push(factorId), { error: null }),
        enroll: async () => ({ data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCD EFGH' } }, error: null }),
        challengeAndVerify: async (a: { factorId: string; code: string }) => (log.verified.push(a), script.verifyOk === false ? { error: { message: 'bad' } } : { data: {}, error: null }),
      },
    },
    rpc: async (name: string) => {
      if (name === 'staff_me') return { data: script.staffMe, error: null }
      if (name === 'admin_state') return { data: { ok: true, name: 'A', role: 'admin', staff: [], cases: [], users: [], appeals: [], held: [], therapists: [], audit: [], revealed: [] }, error: null }
      return { data: { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return log
}

beforeEach(() => {
  resetClock()
  update({ ...freshState(), signedIn: true } as never)
})
afterEach(() => {
  stopAdminPolling()
  stopPolling()
  setClient(null)
})

describe('staff second factor', () => {
  it('asks for the authenticator code after the phone code, and keeps the sign-in', async () => {
    const log = fake({ staffMe: { ok: false, code: 'mfa', error: 'Enter the code' } })
    await adminRequestOtp('+254712000061')
    const r = await adminVerifyOtp('123456')
    expect(r).toMatchObject({ ok: false, code: 'mfa' })
    expect(log.signedOut).toBe(0)
  })

  it('still knows a person at the first level is staff', async () => {
    fake({ staffMe: { ok: false, code: 'mfa', error: 'x' } })
    expect(await isStaff()).toBe(true)
    fake({ staffMe: { ok: false, code: 'not-staff', error: 'x' } })
    expect(await isStaff()).toBe(false)
  })

  it('finds an authenticator already set up', async () => {
    fake({ staffMe: { ok: true }, factors: { totp: [{ id: 'f1' }], all: [{ id: 'f1', status: 'verified' }] } })
    expect(await adminMfaFactor()).toEqual({ factorId: 'f1' })
    fake({ staffMe: { ok: true } })
    expect(await adminMfaFactor()).toBeNull()
  })

  it('sets one up: clears a half-finished attempt, then gives a QR code and a key', async () => {
    const log = fake({ staffMe: { ok: true }, factors: { totp: [], all: [{ id: 'old', status: 'unverified' }, { id: 'keep', status: 'verified' }] } })
    const r = await adminMfaEnroll()
    expect(r).toEqual({ ok: true, value: { factorId: 'f-new', qr: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCD EFGH' } })
    expect(log.unenrolled).toEqual(['old'])
  })

  it('opens the dashboard when the code is right, and says so plainly when it is wrong', async () => {
    const log = fake({ staffMe: { ok: true, name: 'A', role: 'admin', heavy: false } })
    expect((await adminMfaVerify('f1', ' 123456 ')).ok).toBe(true)
    expect(log.verified).toEqual([{ factorId: 'f1', code: '123456' }])
    fake({ staffMe: { ok: true }, verifyOk: false })
    expect(await adminMfaVerify('f1', '000000')).toMatchObject({ ok: false, code: 'wrong' })
  })
})
