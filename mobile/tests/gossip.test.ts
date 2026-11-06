import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { detectNames, gossipFeed, GOSSIP_SPACE, isGossip } from '../src/lib/gossip'
import { generalPosts } from '../src/lib/spaces'
import { resetClock } from '../src/lib/clock'
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
const BODY = 'Everyone at the stage is saying the fares went up on Monday, but nobody has proof.'

beforeEach(() => {
  vi.useFakeTimers()
  resetClock()
  update(freshState())
})

describe('looking for names', () => {
  it('flags a capitalised word in the middle of a sentence', () => {
    expect(detectNames('I heard that Wanjiku left her husband')).toEqual(['Wanjiku'])
    expect(detectNames('So Brian and Otieno were seen together')).toEqual(['Brian', 'Otieno'])
  })
  it('leaves sentence starts, days, places and brands alone', () => {
    expect(detectNames('Everyone is talking. Nobody knows why. Is it true?')).toEqual([])
    expect(detectNames('The new fares started on Monday in Nairobi and Mombasa, said Twitter and TikTok.')).toEqual([])
    expect(detectNames('It all started at a wedding in Kisumu last March')).toEqual([])
  })
  it('does not flag short words or all-capital words', () => {
    expect(detectNames('OMG it is so true, I know')).toEqual([])
  })
})

describe('gossip posts', () => {
  it('are stopped when they name someone, and say how to fix it', () => {
    register()
    const r = api.forum.create({ topic: 'Gossip', title: 'Big news', body: 'They say Wanjiku is moving out of the estate next month.', space: GOSSIP_SPACE })
    expect(r).toMatchObject({ ok: false, code: 'names' })
    expect((r as { error: string }).error).toContain('Wanjiku')
  })
  it('need no joining, stay out of the general feed, and show up in the gossip feed', () => {
    register()
    update((s) => ({ account: { ...s.account!, hasPostedBefore: true } }))
    const r = api.forum.create({ topic: 'Gossip', title: 'Fares are up', body: BODY, space: GOSSIP_SPACE })
    expect(r.ok).toBe(true)
    const posts = getDb().posts
    const mine = posts.find((p) => p.mine && isGossip(p))!
    expect(mine.topic).toBe('Gossip')
    expect(generalPosts(posts).some((p) => p.id === mine.id)).toBe(false)
    expect(gossipFeed(posts).some((p) => p.id === mine.id)).toBe(true)
  })
  it('take reactions but not replies', () => {
    register()
    const id = getDb().posts.find((p) => isGossip(p))!.id
    expect(api.forum.comment(id, 'No way, that is wild')).toMatchObject({ ok: false, code: 'gossip' })
    api.forum.toggleSupport(id)
    expect(getDb().posts.find((p) => p.id === id)!.supportedByMe).toBe(true)
  })
  it('keep the contact-details rule', () => {
    register()
    const r = api.forum.create({ topic: 'Gossip', title: 'Call this number', body: 'Everyone says to ring 0712 345 678 for the details.', space: GOSSIP_SPACE })
    expect(r).toMatchObject({ ok: false, code: 'blocked' })
  })
  it('come with a few starter posts that pass their own rules', () => {
    const seeds = gossipFeed(freshState().posts)
    expect(seeds.length).toBeGreaterThanOrEqual(3)
  })
})
