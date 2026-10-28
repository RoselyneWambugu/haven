import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { freshState, getDb, update } from '../src/store/db'
import { resetClock, advanceClock, now } from '../src/lib/clock'
import { fromEat } from '../src/lib/time'

const reset = () => {
  resetClock()
  update(freshState())
}

/** Registers the demo member through the same steps a person would take. */
function register(opts: { dob?: string } = {}) {
  const d = api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: opts.dob ?? '14/03/1998', email: '' })
  expect(d.ok).toBe(true)
  api.auth.acceptConsents()
  const otp = api.auth.requestOtp('register')
  if (!otp.ok) throw new Error('otp')
  expect(api.auth.verifyOtp(otp.value.demoCode)).toEqual({ ok: true, value: { next: 'create-profile' } })
  api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English', 'Kiswahili'] })
  expect(api.auth.completeRegistration('web').ok).toBe(true)
}

const registerPaid = () => {
  register()
  api.demo.grantPlan('monthly')
}

beforeEach(() => {
  vi.useFakeTimers()
  reset()
})
afterEach(() => vi.useRealTimers())

describe('registration', () => {
  it('stops under-18s and keeps nothing', () => {
    const r = api.auth.submitDetails({ fullName: 'Young Person', phone: '0712345678', dob: '01/01/2012', email: '' })
    expect(r).toMatchObject({ ok: false, code: 'under-18' })
    expect(getDb().reg).toBeNull()
  })
  it('validates each field with a clear message', () => {
    expect(api.auth.submitDetails({ fullName: '', phone: '0712345678', dob: '14/03/1998', email: '' })).toMatchObject({ code: 'name' })
    expect(api.auth.submitDetails({ fullName: 'Amina', phone: '12345', dob: '14/03/1998', email: '' })).toMatchObject({ code: 'phone' })
    expect(api.auth.submitDetails({ fullName: 'Amina', phone: '0712345678', dob: '31/02/1998', email: '' })).toMatchObject({ code: 'dob' })
    expect(api.auth.submitDetails({ fullName: 'Amina', phone: '0712345678', dob: '14/03/1998', email: 'nope' })).toMatchObject({ code: 'email' })
  })
  it('creates an account with a public and a private profile', () => {
    register()
    const a = getDb().account!
    expect(a.public.penName).toBe('QuietHeron')
    expect(a.public.ageBand).toBe('25-34')
    expect(a.private.phone).toBe('+254712345678')
    expect(a.private.fullName).toBe('Amina Otieno')
    expect(JSON.stringify(a.public)).not.toMatch(/Amina|Otieno|254/)
    expect(getDb().signedIn).toBe(true)
  })
  it('refuses a pen name that looks like a real name, or is taken', () => {
    expect(api.auth.checkPenName('AminaOtieno')).toMatchObject({ ok: false, code: 'real-name' })
    expect(api.auth.checkPenName('SilverRiver')).toMatchObject({ ok: false, code: 'taken' })
    expect(api.auth.checkPenName('QuietHeron')).toEqual({ ok: true, value: undefined })
  })
})

describe('one-time codes', () => {
  it('counts wrong tries then locks, and the lock survives asking again', () => {
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712345678', dob: '14/03/1998', email: '' })
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    const wrong = otp.value.demoCode === '000000' ? '111111' : '000000'
    expect(api.auth.verifyOtp(wrong)).toMatchObject({ ok: false, error: 'That code doesn’t match. 4 tries left.' })
    for (let i = 0; i < 3; i++) api.auth.verifyOtp(wrong)
    expect(api.auth.verifyOtp(wrong)).toMatchObject({ ok: false, code: 'locked' })
    expect(api.auth.requestOtp('register')).toMatchObject({ ok: false, code: 'locked' })
    // even the right code is refused while locked
    expect(api.auth.verifyOtp(otp.value.demoCode)).toMatchObject({ ok: false, code: 'locked' })
    advanceClock(16)
    expect(api.auth.requestOtp('register').ok).toBe(true)
  })
  it('expires old codes', () => {
    api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712345678', dob: '14/03/1998', email: '' })
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) throw new Error('otp')
    advanceClock(11)
    expect(api.auth.verifyOtp(otp.value.demoCode)).toMatchObject({ ok: false, code: 'expired' })
  })
  it('sign-in does not reveal whether a number has an account until the code is proven', () => {
    const otp = api.auth.requestOtp('login', '0799 000 111')
    expect(otp.ok).toBe(true) // same answer for any valid number
    if (!otp.ok) throw new Error('otp')
    expect(api.auth.verifyOtp(otp.value.demoCode)).toEqual({ ok: true, value: { next: 'no-account' } })
  })
  it('signs a returning member in', () => {
    register()
    api.auth.signOut()
    expect(getDb().signedIn).toBe(false)
    const otp = api.auth.requestOtp('login', '+254712345678')
    if (!otp.ok) throw new Error('otp')
    expect(api.auth.verifyOtp(otp.value.demoCode)).toEqual({ ok: true, value: { next: 'trust-device' } })
    expect(getDb().signedIn).toBe(true)
  })
  it('a pending deletion is cancelled by signing back in', () => {
    register()
    api.account.requestDeletion(true)
    expect(getDb().signedIn).toBe(false)
    expect(api.account.deletionDaysLeft()).toBe(14)
    const otp = api.auth.requestOtp('login', '0712345678')
    if (!otp.ok) throw new Error('otp')
    api.auth.verifyOtp(otp.value.demoCode)
    expect(getDb().account!.deletionRequestedAt).toBeNull()
  })
})

describe('pen name changes', () => {
  it('limits how often a name can change', () => {
    register()
    expect(api.auth.changePenName('GentleDune').ok).toBe(true)
    expect(api.auth.changePenName('BraveEmber')).toMatchObject({ ok: false, code: 'limit' })
    advanceClock(31 * 24 * 60)
    expect(api.auth.changePenName('BraveEmber').ok).toBe(true)
  })
})

describe('matching and chat', () => {
  it('needs a paid plan first (peer chat is not free)', () => {
    register()
    expect(api.match.start()).toMatchObject({ ok: false, code: 'needs-plan' })
  })
  it('matches an adult who shares a language and band, and never someone blocked', () => {
    register()
    api.demo.grantPlan('monthly')
    expect(api.match.start().ok).toBe(true)
    vi.advanceTimersByTime(5000)
    const m = getDb().match
    expect(m.state).toBe('found')
    const conv = getDb().conversations[0]
    expect(conv.peer!.languages.some((l) => ['English', 'Kiswahili'].includes(l))).toBe(true)
    api.chat.block(conv.id, true)
    expect(getDb().account!.blocked).toHaveLength(1)
    expect(getDb().conversations).toHaveLength(0)
    expect(getDb().reports).toHaveLength(1)
    // the blocked person is never matched again
    for (let i = 0; i < 6; i++) {
      api.match.cancelSearch()
      api.match.start()
      vi.advanceTimersByTime(5000)
      const c = getDb().conversations[0]
      if (c) {
        expect(c.peer!.id).not.toBe(getDb().account!.blocked[0].id)
        api.chat.end(c.id)
      }
    }
  })
  it('blocks contact details on the server too, and delivers ordinary messages', () => {
    register()
    api.demo.grantPlan('monthly')
    api.match.start()
    vi.advanceTimersByTime(5000)
    const id = getDb().conversations[0].id
    const bad = api.chat.send(id, 'call me on 0712 345 678')
    expect(bad).toMatchObject({ ok: false, code: 'blocked' })
    expect(getDb().conversations[0].messages.some((m) => m.text.includes('0712'))).toBe(false)
    expect(api.chat.send(id, 'Work has been a lot lately.').ok).toBe(true)
    vi.advanceTimersByTime(4000)
    const msgs = getDb().conversations[0].messages
    expect(msgs.at(-1)!.from).toBe('them')
  })
  it('becomes read-only when the plan lapses, but the history stays', () => {
    register()
    api.demo.grantPlan('monthly')
    api.match.start()
    vi.advanceTimersByTime(5000)
    const id = getDb().conversations[0].id
    api.demo.lapsePlan()
    expect(api.chat.send(id, 'Hello again')).toMatchObject({ ok: false, code: 'read-only' })
    expect(getDb().conversations[0].messages.length).toBeGreaterThan(0)
  })
  it('disappearing chat needs the other person to agree', () => {
    register()
    api.demo.grantPlan('monthly')
    api.match.start()
    vi.advanceTimersByTime(5000)
    const id = getDb().conversations[0].id
    api.chat.proposeDisappearing(id)
    expect(getDb().conversations[0].disappearing).toBe('proposed-by-me')
    vi.advanceTimersByTime(3000)
    expect(getDb().conversations[0].disappearing).toBe('on')
  })
})

describe('forum', () => {
  it('holds a first post for review, then publishes it', () => {
    registerPaid()
    const r = api.forum.create({ topic: 'Anxiety', title: 'Hard week', body: 'I have been feeling overwhelmed and cannot sleep.' })
    expect(r).toMatchObject({ ok: true, value: { pending: true } })
    expect(getDb().posts[0].status).toBe('pending')
    expect(api.forum.comment(getDb().posts[0].id, 'Hello')).toMatchObject({ ok: false, code: 'pending' })
    vi.advanceTimersByTime(16000)
    expect(getDb().posts[0].status).toBe('published')
    const second = api.forum.create({ topic: 'Anxiety', title: 'Another', body: 'A second post goes straight up.' })
    expect(second).toMatchObject({ ok: true, value: { pending: false } })
  })
  it('refuses posts and comments with contact details', () => {
    registerPaid()
    expect(api.forum.create({ topic: 'Grief', title: 'Help', body: 'Please call me on 0712345678 to talk about it.' })).toMatchObject({ ok: false, code: 'blocked' })
    expect(api.forum.comment('f1', 'see www.example.com')).toMatchObject({ ok: false, code: 'blocked' })
  })
  it('lets people add support once, and take it back', () => {
    registerPaid()
    const before = getDb().posts.find((p) => p.id === 'f1')!.supports
    api.forum.toggleSupport('f1')
    expect(getDb().posts.find((p) => p.id === 'f1')!.supports).toBe(before + 1)
    api.forum.toggleSupport('f1')
    expect(getDb().posts.find((p) => p.id === 'f1')!.supports).toBe(before)
  })
  it('allows editing only inside 15 minutes', () => {
    registerPaid()
    const r = api.forum.create({ topic: 'Anxiety', title: 'Hard week', body: 'I have been feeling overwhelmed and cannot sleep.' })
    if (!r.ok) throw new Error('create')
    expect(api.forum.edit(r.value.post.id, { title: 'Hard week, update', body: 'I have been feeling a little better now.' }).ok).toBe(true)
    advanceClock(16)
    expect(api.forum.edit(r.value.post.id, { title: 'x', body: 'Changing it much later on.' })).toMatchObject({ ok: false, code: 'window' })
  })
})

describe('payments, sessions and plans', () => {
  it('buys a plan, and a failed payment leaves nothing behind', async () => {
    register()
    expect(api.billing.createCheckout({ kind: 'plan', planId: 'monthly', autoRenew: false }).ok).toBe(true)
    api.demo.failNextPayment(true)
    const p1 = api.billing.pay('mpesa')
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p1).toMatchObject({ ok: false, failure: 'timeout' })
    expect(getDb().subscription).toBeNull()
    const p2 = api.billing.pay('mpesa')
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p2).toMatchObject({ ok: true })
    expect(getDb().subscription?.planId).toBe('monthly')
  })
  it('books a therapist session and offers a free change until 24 hours before', async () => {
    registerPaid()
    // find a real slot for Dr. Amina
    const { THERAPISTS } = await import('../src/data/seed')
    const { slotsFor } = await import('../src/lib/directory')
    const t = THERAPISTS[0]
    const slot = slotsFor(t, [], now(), 14).find((s) => s.start > now() + 3 * 24 * 3600_000 && s.modes.includes('voice'))!
    const co = api.billing.createCheckout({ kind: 'session', therapistId: t.id, mode: 'voice', start: slot.start })
    expect(co.ok).toBe(true)
    const pay = api.billing.pay('mpesa')
    await vi.advanceTimersByTimeAsync(3000)
    const res = await pay
    expect(res.ok).toBe(true)
    const sid = res.sessionId!
    // that time is now gone for others in my list
    expect(api.billing.createCheckout({ kind: 'session', therapistId: t.id, mode: 'voice', start: slot.start })).toMatchObject({ ok: false, code: 'taken' })
    expect(api.sessions.join(sid)).toMatchObject({ ok: false, code: 'early' })
    // the join window opens 10 minutes before
    advanceClock(Math.floor((slot.start - 10 * 60_000 - now()) / 60_000) + 1)
    expect(api.sessions.join(sid).ok).toBe(true)
    // cancelling inside 24 hours is "late"
    expect(api.sessions.cancel(sid)).toEqual({ ok: true, value: { outcome: 'late' } })
    expect(getDb().sessions[0].lateChargeApplied).toBe(true)
  })
  it('refuses a mode the therapist does not offer', () => {
    register()
    const r = api.billing.createCheckout({ kind: 'session', therapistId: 't-peter', mode: 'video', start: fromEat(2026, 9, 26, 10, 0) })
    expect(r.ok).toBe(false)
  })
  it('cancelling a plan keeps access until the end', () => {
    register()
    api.demo.grantPlan('monthly')
    api.billing.cancelPlan()
    expect(getDb().subscription!.cancelledAt).not.toBeNull()
    expect(api.match.start().ok).toBe(true) // still 'ending', so chat works
  })
})

describe('help tickets', () => {
  it('routes a ticket that mentions risk to the crisis queue and answers quickly', () => {
    register()
    const r = api.tickets.create({ deptId: 'billing', subject: 'Charged twice', text: 'I was charged twice and I feel like I want to die.' })
    expect(r).toMatchObject({ ok: true, value: { crisis: true } })
    vi.advanceTimersByTime(3500)
    const t = getDb().tickets[0]
    expect(t.status).toBe('replied')
    expect(t.messages.at(-1)!.text).toMatch(/emergency services/)
  })
  it('replies by department for everything else', () => {
    register()
    api.tickets.create({ deptId: 'billing', subject: 'Charged twice', text: 'I was charged twice on 17 October for my plan.' })
    vi.advanceTimersByTime(7000)
    expect(getDb().tickets[0].messages.at(-1)!.text).toMatch(/refund/)
    api.tickets.markRead(getDb().tickets[0].id)
    expect(getDb().tickets[0].unread).toBe(false)
  })
})

describe('account safety', () => {
  it('secures the account: signs out everywhere and deletes nothing', () => {
    register()
    expect(getDb().account!.devices.length).toBeGreaterThan(1)
    api.demo.newDeviceAlert()
    api.account.secure()
    expect(getDb().account!.devices).toHaveLength(1)
    expect(getDb().signedIn).toBe(false)
    expect(getDb().account).not.toBeNull()
  })
  it('only opens the private profile after a fresh code', () => {
    register()
    expect(api.auth.isReauthed()).toBe(false)
    const otp = api.auth.requestOtp('reauth')
    if (!otp.ok) throw new Error('otp')
    expect(api.auth.verifyOtp(otp.value.demoCode)).toEqual({ ok: true, value: { next: 'reauth-ok' } })
    expect(api.auth.isReauthed()).toBe(true)
    advanceClock(6)
    expect(api.auth.isReauthed()).toBe(false)
  })
  it('exports the member’s own data', () => {
    register()
    const data = JSON.parse(api.account.exportData())
    expect(data.account.private.fullName).toBe('Amina Otieno')
  })
  it('an appeal goes to review and comes back reduced', () => {
    register()
    api.demo.addNotice()
    const n = getDb().account!.notices[0]
    expect(api.account.appeal(n.id, 'short')).toMatchObject({ ok: false })
    expect(api.account.appeal(n.id, 'I was quoting a helpline number that someone else sent.').ok).toBe(true)
    expect(getDb().account!.notices[0].appeal).toBe('pending')
    vi.advanceTimersByTime(13000)
    expect(getDb().account!.notices[0].appeal).toBe('reduced')
  })
})
