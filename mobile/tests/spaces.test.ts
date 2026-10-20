import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { SPACES, spaceById, spaceSeedPosts } from '../src/data/spaces'
import { THERAPISTS } from '../src/data/seed'
import { resetClock, now } from '../src/lib/clock'
import { detectBlockedContent } from '../src/lib/safety'
import { canRead, generalPosts, needsCheck, spaceFeed } from '../src/lib/spaces'
import { freshState, getDb, update } from '../src/store/db'

const register = () => {
  api.auth.submitDetails({ fullName: 'Amina Otieno', phone: '0712 345 678', dob: '14/03/1998', email: '' })
  api.auth.acceptConsents()
  const otp = api.auth.requestOtp('register')
  if (!otp.ok) throw new Error('otp')
  api.auth.verifyOtp(otp.value.demoCode)
  api.auth.saveProfileDraft({ penName: 'QuietHeron', avatar: 'moon', languages: ['English'] })
  api.auth.completeRegistration('web')
  api.demo.grantPlan('monthly')
}
const BODY = 'Some days are harder than others and I wanted to say so.'

describe('the spaces', () => {
  it('cover domestic violence, PTSD and grief, each led by a verified therapist', () => {
    for (const id of ['domestic-violence', 'ptsd', 'grief']) {
      const s = spaceById(id)!
      expect(s).toBeTruthy()
      expect(THERAPISTS.some((t) => t.id === s.facilitatorId)).toBe(true)
    }
    expect(spaceById('domestic-violence')!.sensitive).toBe(true)
    expect(spaceById('ptsd')!.sensitive).toBe(true)
  })
  it('have no phone numbers in their pinned text, and starter posts that pass the content rules', () => {
    for (const s of SPACES) {
      expect(/\d/.test(s.welcome)).toBe(false)
      expect(detectBlockedContent(`${s.welcome}\n${s.rules.join('\n')}`).blocked).toBe(false)
    }
    for (const p of spaceSeedPosts(Date.now())) expect(detectBlockedContent(`${p.title}\n${p.body}`).blocked).toBe(false)
  })
  it('give every space a starter post from its therapist', () => {
    const posts = spaceSeedPosts(Date.now())
    for (const s of SPACES) expect(posts.some((p) => p.space === s.id && p.authorKey === s.facilitatorId)).toBe(true)
  })
})

describe('space rules', () => {
  it('keeps sensitive spaces for members and leaves space posts out of the general feed', () => {
    const dv = spaceById('domestic-violence')!
    expect(canRead(dv, [])).toBe(false)
    expect(canRead(dv, ['domestic-violence'])).toBe(true)
    expect(canRead(spaceById('grief')!, [])).toBe(true)
    const posts = spaceSeedPosts(1000)
    expect(generalPosts(posts)).toHaveLength(0)
    expect(spaceFeed(posts, 'grief').every((p) => p.space === 'grief')).toBe(true)
  })
  it('checks every post in a sensitive space, not just the first', () => {
    expect(needsCheck(spaceById('ptsd'), true)).toBe(true)
    expect(needsCheck(spaceById('grief'), true)).toBe(false)
    expect(needsCheck(spaceById('grief'), false)).toBe(true)
    expect(needsCheck(undefined, true)).toBe(false)
  })
  it('hides posts a member has hidden or muted', () => {
    const posts = spaceSeedPosts(1000)
    const first = spaceFeed(posts, 'grief')[0]
    expect(spaceFeed(posts, 'grief', [first.id]).some((p) => p.id === first.id)).toBe(false)
    expect(spaceFeed(posts, 'grief', [], [first.authorKey]).some((p) => p.authorKey === first.authorKey)).toBe(false)
  })
})

describe('joining and posting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    register()
    api.spaces.ensureSeeds()
  })

  it('adds starter posts once', () => {
    const n = getDb().posts.length
    api.spaces.ensureSeeds()
    expect(getDb().posts).toHaveLength(n)
    expect(getDb().posts.filter((p) => p.space === 'grief').length).toBeGreaterThan(0)
  })
  it('lets a member join and leave, and a paused account not join', () => {
    expect(api.spaces.join('grief').ok).toBe(true)
    expect(getDb().spaces).toEqual(['grief'])
    api.spaces.join('grief')
    expect(getDb().spaces).toEqual(['grief'])
    api.spaces.leave('grief')
    expect(getDb().spaces).toEqual([])
    expect(api.spaces.join('nope').ok).toBe(false)
    update((s) => (s.account ? { account: { ...s.account, standing: 'paused' as const } } : {}))
    expect(api.spaces.join('grief')).toMatchObject({ ok: false, code: 'paused' })
  })
  it('needs a join before posting, and names the space as the topic', () => {
    expect(api.forum.create({ topic: 'x', title: 'Hello', body: BODY, space: 'grief' })).toMatchObject({ ok: false, code: 'not-joined' })
    api.spaces.join('grief')
    const r = api.forum.create({ topic: 'ignored', title: 'Hello', body: BODY, space: 'grief' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.post).toMatchObject({ space: 'grief', topic: 'Grief and loss', mine: true })
    expect(api.forum.create({ topic: 'x', title: 'Hello', body: BODY, space: 'nope' })).toMatchObject({ ok: false, code: 'space' })
  })
  it('holds every post in a sensitive space for checking, but not a second post in an open one', () => {
    api.spaces.join('domestic-violence')
    api.spaces.join('grief')
    api.forum.create({ topic: 'x', title: 'First', body: BODY, space: 'grief' })
    vi.advanceTimersByTime(16_000)
    const second = api.forum.create({ topic: 'x', title: 'Second', body: BODY, space: 'grief' })
    expect(second.ok && second.value.pending).toBe(false)
    const dv = api.forum.create({ topic: 'x', title: 'Hard night', body: BODY, space: 'domestic-violence' })
    expect(dv.ok && dv.value.pending).toBe(true)
  })
  it('still blocks contact details in a space', () => {
    api.spaces.join('grief')
    expect(api.forum.create({ topic: 'x', title: 'Hi', body: 'Call me on 0712 345 678 any time', space: 'grief' })).toMatchObject({ ok: false, code: 'blocked' })
  })
  it('has the space’s own therapist reply to a post in it', () => {
    api.spaces.join('ptsd')
    api.forum.create({ topic: 'x', title: 'Loud noises', body: BODY, space: 'ptsd' })
    vi.advanceTimersByTime(16_000 + 21_000 + 46_000)
    const post = getDb().posts.find((p) => p.mine)!
    expect(post.comments.find((c) => c.therapistId)?.therapistId).toBe(spaceById('ptsd')!.facilitatorId)
    expect(now()).toBeGreaterThan(0)
  })
})
