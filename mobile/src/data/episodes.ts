import type { AvatarKind, Episode } from '@/api/types'

const DAY = 24 * 3600_000

/**
 * The demo's episodes. The real service has none of these: staff upload their own. The demo plays a short public sample clip,
 * so the Watch tab can be seen working without any video of ours.
 */
export const DEMO_VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'

export function demoEpisodes(now: number): Episode[] {
  return [
    { id: 'ep-3', title: 'Talking to your parents about money and mood', blurb: 'Two friends and a counsellor on how to start a hard conversation at home without it turning into an argument.', durationSec: 1860, publishedAt: now - 2 * DAY, posterUrl: null, likes: 0, comments: 0, myReaction: 0 },
    { id: 'ep-2', title: 'What grief really looks like after the first month', blurb: 'People share what nobody told them about the weeks after a loss, and what helped them get through the days.', durationSec: 2340, publishedAt: now - 9 * DAY, posterUrl: null, likes: 0, comments: 0, myReaction: 0 },
    { id: 'ep-1', title: 'Why we find it hard to say we are not okay', blurb: 'An honest hour on pride, family and the words we use to hide how we feel, with tips for saying it out loud.', durationSec: 1725, publishedAt: now - 16 * DAY, posterUrl: null, likes: 0, comments: 0, myReaction: 0 },
  ]
}

/** Demo likes before the member reacts, and the comments each sample episode starts with. */
export const DEMO_LIKES: Record<string, number> = { 'ep-1': 41, 'ep-2': 27, 'ep-3': 12 }
export const DEMO_COMMENTS: Record<string, { name: string; avatar: AvatarKind; text: string; hoursAgo: number }[]> = {
  'ep-1': [{ name: 'GentleFern', avatar: 'fern', text: 'I needed to hear that it is okay to say it out loud. Thank you.', hoursAgo: 30 }],
  'ep-2': [{ name: 'BlueHeron', avatar: 'moon', text: 'The part about the weeks after the funeral is exactly what it was like for me.', hoursAgo: 20 }, { name: 'QuietPine', avatar: 'leaf', text: 'Sharing this with my sister tonight.', hoursAgo: 6 }],
  'ep-3': [],
}
