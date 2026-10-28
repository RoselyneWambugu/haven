import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { DEMO_MFA } from '../src/api/admin'
import { THERAPISTS } from '../src/data/seed'
import { resetClock, now } from '../src/lib/clock'
import { filterTherapists, NO_FILTERS } from '../src/lib/directory'
import { freshState, getDb, update } from '../src/store/db'

const T = THERAPISTS[0].id

describe('therapist suspension', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    for (const t of THERAPISTS) { t.suspended = false; t.acceptingNew = true }
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
    api.auth.acceptConsents()
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
    api.auth.completeRegistration('web')
    update({ sessions: [{ id: 's1', therapistId: T, mode: 'chat', start: now() + 86400_000, end: now() + 86400_000 + 3000_000, status: 'booked', priceKes: null, receiptNo: 'R', createdAt: 0, rating: null, followUpOffer: null, lateChargeApplied: false } as never] })
    api.admin.signIn('Dr. K. Mwende', DEMO_MFA)
  })

  it('needs a reason and the right role', () => {
    expect(api.admin.suspendTherapist(T, 'no')).toMatchObject({ ok: false, code: 'reason' })
    api.admin.signIn('T. Njeri', DEMO_MFA)
    expect(api.admin.suspendTherapist(T, 'A proper reason')).toMatchObject({ ok: false, code: 'role' })
    api.admin.signIn('J. Otieno', DEMO_MFA)
    expect(api.admin.suspendTherapist(T, 'A proper reason')).toMatchObject({ ok: false, code: 'role' })
    expect(api.admin.suspendTherapist('nobody', 'A proper reason').ok).toBe(false)
  })
  it('hides them from the directory, stops booking, and logs it', () => {
    expect(api.admin.suspendTherapist(T, 'Licence suspended by the regulator').ok).toBe(true)
    expect(THERAPISTS[0].suspended).toBe(true)
    expect(filterTherapists(THERAPISTS, [], NO_FILTERS, now()).some((r) => r.therapist.id === T)).toBe(false)
    expect(api.billing.createCheckout({ kind: 'session', therapistId: T, mode: 'chat', start: now() + 3600_000 }).ok).toBe(false)
    expect(getDb().admin!.audit[0]).toMatchObject({ action: 'Suspended therapist' })
    expect(api.admin.suspendTherapist(T, 'Again please').ok).toBe(false)
  })
  it('cancels booked sessions with no charge and tells the member', () => {
    api.admin.suspendTherapist(T, 'Licence suspended by the regulator')
    expect(getDb().sessions[0]).toMatchObject({ status: 'cancelled', lateChargeApplied: false })
    expect(getDb().notifications.some((n) => n.title === 'Your session can’t go ahead' && n.body.includes('won’t be charged'))).toBe(true)
  })
  it('can be reinstated, with a reason', () => {
    api.admin.suspendTherapist(T, 'Licence suspended by the regulator')
    expect(api.admin.reinstateTherapist(T, 'no')).toMatchObject({ ok: false, code: 'reason' })
    expect(api.admin.reinstateTherapist(T, 'Licence restored and checked').ok).toBe(true)
    expect(THERAPISTS[0].suspended).toBe(false)
    expect(filterTherapists(THERAPISTS, [], NO_FILTERS, now()).some((r) => r.therapist.id === T)).toBe(true)
    expect(api.admin.reinstateTherapist(T, 'Licence restored and checked').ok).toBe(false)
  })
  it('stays suspended when the portal re-applies the profile', () => {
    api.portal.signIn()
    const mine = getDb().portal!.therapistId
    api.admin.suspendTherapist(mine, 'Licence suspended by the regulator')
    api.portal.setPaused(false)
    expect(THERAPISTS.find((t) => t.id === mine)!.acceptingNew).toBe(false)
  })
})
