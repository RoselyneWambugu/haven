import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../src/api'
import { PEER_HEAVY_REPLY, PEER_POST_REPLIES, THERAPIST_POST_REPLY } from '../src/api/bot'
import { detectBlockedContent } from '../src/lib/safety'
import { detectSolicitation } from '../src/lib/portal'
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
}
const mine = () => getDb().posts.find((p) => p.mine)!

describe('replies to a member’s post', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetClock()
    update(freshState())
    register()
  })

  it('arrive after the post is live: a peer first, then a verified therapist', () => {
    expect(api.forum.create({ topic: 'Grief', title: 'A hard week', body: 'Work has been heavy and I am tired.' }).ok).toBe(true)
    expect(mine().comments).toHaveLength(0)
    vi.advanceTimersByTime(16_000)
    expect(mine().status).toBe('published')
    vi.advanceTimersByTime(21_000)
    expect(mine().comments).toHaveLength(1)
    expect(mine().comments[0]).toMatchObject({ mine: false, therapistId: null })
    vi.advanceTimersByTime(46_000)
    expect(mine().comments).toHaveLength(2)
    expect(mine().comments[1].therapistId).not.toBeNull()
  })
  it('send a notification for each reply, once', () => {
    api.forum.create({ topic: 'Grief', title: 'A hard week', body: 'Work has been heavy and I am tired.' })
    vi.advanceTimersByTime(90_000)
    const replies = getDb().notifications.filter((n) => n.title === 'New reply to your post')
    expect(replies).toHaveLength(2)
    expect(replies[0].href).toBe(`/forum/${mine().id}`)
    expect(replies.every((n) => !n.body.includes('tired'))).toBe(true)
  })
  it('do not repeat, and stop if the post is removed or posting is off', () => {
    api.forum.create({ topic: 'Grief', title: 'A hard week', body: 'Work has been heavy and I am tired.' })
    vi.advanceTimersByTime(90_000)
    vi.advanceTimersByTime(300_000)
    expect(mine().comments).toHaveLength(2)
    api.forum.create({ topic: 'Grief', title: 'Second one', body: 'Another post that is long enough.' })
    api.forum.remove(getDb().posts.find((p) => p.title === 'Second one')!.id)
    vi.advanceTimersByTime(90_000)
    expect(getDb().posts.some((p) => p.title === 'Second one')).toBe(false)
  })
  it('meet a hard post with urgent help, not tips', () => {
    api.forum.create({ topic: 'Grief', title: 'I cannot go on', body: 'I want to end my life, I feel hopeless.' })
    vi.advanceTimersByTime(16_000)
    vi.advanceTimersByTime(21_000)
    expect(mine().comments[0].text).toBe(PEER_HEAVY_REPLY)
    expect(PEER_HEAVY_REPLY).toContain('Urgent help')
  })
  it('never share contact details or invite anyone to book', () => {
    for (const t of [...PEER_POST_REPLIES, PEER_HEAVY_REPLY, THERAPIST_POST_REPLY]) {
      expect(detectBlockedContent(t).blocked).toBe(false)
      expect(detectSolicitation(t)).toBe(false)
    }
    expect(THERAPIST_POST_REPLY).toContain('not advice')
  })
})
