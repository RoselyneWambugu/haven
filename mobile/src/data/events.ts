import type { CommunityEvent } from '@/api/types'
import { startOfEatDay } from '@/lib/time'

const H = 3600_000
const D = 24 * H

/** Starter events so the Community has something to show in the demo. Staff add real ones from the dashboard. */
export function seedEvents(now: number): CommunityEvent[] {
  const day = startOfEatDay(now)
  const at = (days: number, hour: number) => day + days * D + hour * H
  const e = (x: Omit<CommunityEvent, 'interestedByMe'>): CommunityEvent => ({ ...x, interestedByMe: false })
  return [
    e({
      id: 'ev-sleep', title: 'Sleeping better when your mind will not switch off', blurb: 'A relaxed talk on why nights get loud and a few small routines that help. Bring questions; there is time at the end.',
      kind: 'webinar', mode: 'online', place: 'Online. The link is sent to everyone interested the day before.', startsAt: at(2, 19), durationMin: 60, host: 'Dr. Amina Otieno', interested: 38,
    }),
    e({
      id: 'ev-walk', title: 'A morning walk in the park', blurb: 'An easy, unhurried group walk with a therapist alongside. No need to talk unless you want to. Wear comfortable shoes.',
      kind: 'walk', mode: 'in-person', place: 'Karura Forest, main gate (Limuru Road entrance)', startsAt: at(4, 8), durationMin: 90, host: 'Echo', interested: 54,
    }),
    e({
      id: 'ev-grief', title: 'Writing through grief: a gentle workshop', blurb: 'Short writing prompts for anyone carrying a loss. Nothing is shared unless you choose to. Paper and a pen are all you need.',
      kind: 'workshop', mode: 'online', place: 'Online. The link is sent to everyone interested the day before.', startsAt: at(7, 18), durationMin: 75, host: 'Dr. Grace Wanjiru', interested: 21,
    }),
  ]
}
