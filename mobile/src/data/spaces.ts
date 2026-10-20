import type { ForumComment, ForumPost } from '@/api/types'
import type { IconName } from '@/components/Icon'
import { THERAPISTS } from './seed'

const H = 3600_000

export interface Space {
  id: string
  name: string
  blurb: string
  icon: IconName
  /** Sensitive spaces are readable only by members who joined, and every post is checked before it goes live. */
  sensitive: boolean
  /** The verified therapist who looks after the space. */
  facilitatorId: string
  /** Pinned at the top. No phone numbers: crisis numbers live in Urgent help, where they are checked. */
  welcome: string
  rules: string[]
}

const COMMON = ['Be kind. Everyone here is going through something.', 'Never share contact details, places or names. It keeps everyone safe.']

export const SPACES: Space[] = [
  {
    id: 'domestic-violence', name: 'Domestic violence and abuse', blurb: 'For people who are living with, leaving or recovering from abuse at home.', icon: 'shield', sensitive: true, facilitatorId: THERAPISTS[2].id,
    welcome: 'You are not to blame, and you are not alone. If you are in danger right now, use Urgent help at the top. Echo can be seen on your phone, so turn on Quick exit in Settings and think about who can see this screen.',
    rules: [...COMMON, 'Please don’t describe violence in detail. Say how you feel and what you need.', 'Never name or identify the person who hurt you.', 'Don’t pressure anyone to leave or to stay. Each person knows their own situation.'],
  },
  {
    id: 'ptsd', name: 'PTSD and trauma', blurb: 'Flashbacks, nightmares, being on edge, and finding steadier ground.', icon: 'heart', sensitive: true, facilitatorId: THERAPISTS[0].id,
    welcome: 'Welcome. Write only as much as feels safe. You never have to tell the story to belong here. If a post is too much, you can mute or hide it, and Urgent help is always at the top.',
    rules: [...COMMON, 'Please don’t describe traumatic events in detail. Use a short content note if you need to mention one.', 'Share what helps you, not what should work for everyone.'],
  },
  {
    id: 'grief', name: 'Grief and loss', blurb: 'Losing someone, or something that mattered.', icon: 'forum', sensitive: false, facilitatorId: THERAPISTS[0].id,
    welcome: 'Grief has no timetable. You are welcome here whether the loss was last week or years ago.',
    rules: [...COMMON, 'No “at least” or “they are in a better place”. Listen first.'],
  },
  {
    id: 'anxiety', name: 'Anxiety and panic', blurb: 'Worry that won’t switch off, racing thoughts and panic.', icon: 'help', sensitive: false, facilitatorId: THERAPISTS[1].id,
    welcome: 'Welcome. Small steps count here. A therapist reads this space and adds general information from time to time.',
    rules: [...COMMON, 'Share what has worked for you as your own experience, not as medical advice.'],
  },
  {
    id: 'depression', name: 'Depression and low mood', blurb: 'Heavy days, no energy, and finding a little light.', icon: 'cal', sensitive: false, facilitatorId: THERAPISTS[3].id,
    welcome: 'You don’t have to be okay to be here. If it feels like too much, Urgent help is free and open any time.',
    rules: [...COMMON, 'Please don’t share methods of self-harm. If you are thinking about it, use Urgent help.'],
  },
  {
    id: 'recovery', name: 'Addiction and recovery', blurb: 'Alcohol, drugs and other habits: cravings, setbacks and staying on track.', icon: 'star', sensitive: false, facilitatorId: THERAPISTS[4].id,
    welcome: 'A setback is not the end of the road. Tell us where you are today, without shame.',
    rules: [...COMMON, 'Don’t share where to get substances.', 'No judgement about relapse.'],
  },
]

export const spaceById = (id: string | undefined): Space | undefined => SPACES.find((s) => s.id === id)

const t = (i: number) => THERAPISTS[i]

function mk(space: Space, n: number, p: Pick<ForumPost, 'authorName' | 'authorAvatar' | 'authorKey' | 'title' | 'body' | 'supports'> & { hoursAgo: number; comments?: ForumComment[] }, now: number): ForumPost {
  return {
    id: `sp-${space.id}-${n}`, authorName: p.authorName, authorAvatar: p.authorAvatar, authorKey: p.authorKey, topic: space.name, space: space.id,
    title: p.title, body: p.body, createdAt: now - p.hoursAgo * H, supports: p.supports, supportedByMe: false, comments: p.comments ?? [], status: 'published', mine: false,
  }
}

const reply = (id: string, name: string, avatar: ForumComment['authorAvatar'], text: string, now: number, hoursAgo: number): ForumComment => ({
  id, authorName: name, authorAvatar: avatar, text, at: now - hoursAgo * H, hiddenReason: null, mine: false, therapistId: null, therapistName: null,
})

/** A few starter posts per space, so a new space is never empty. A real service has real members. */
export function spaceSeedPosts(now: number): ForumPost[] {
  const by = (id: string) => SPACES.find((s) => s.id === id)!
  return [
    mk(by('domestic-violence'), 1, { authorName: t(2).name, authorAvatar: 'leaf', authorKey: t(2).id, hoursAgo: 72, supports: 40, title: 'Welcome to this space', body: 'This is a place to be heard, without judgement. You decide how much to share. Nobody here will tell you what you should do. I read every post and will add general information from time to time.' }, now),
    mk(by('domestic-violence'), 2, { authorName: 'SteadyPine', authorAvatar: 'pine', authorKey: 'p-steady', hoursAgo: 20, supports: 18, title: 'Feeling guilty for thinking about leaving', body: 'I keep telling myself it is not that bad. Some days I feel strong and other days I feel like I am betraying everyone.', comments: [reply('sp-dv-2c1', 'GentleFern', 'fern', 'Thank you for writing this. Feeling torn is so human. You are not betraying anyone by thinking.', now, 18)] }, now),
    mk(by('ptsd'), 1, { authorName: t(0).name, authorAvatar: 'leaf', authorKey: t(0).id, hoursAgo: 96, supports: 33, title: 'Welcome. You set the pace', body: 'You never have to share what happened. Many of us find it helps just to say how we are today. Grounding, sleep and being among people who understand can all help. This is general information, not treatment.' }, now),
    mk(by('ptsd'), 2, { authorName: 'WarmLantern', authorAvatar: 'sun', authorKey: 'p-warm', hoursAgo: 30, supports: 21, title: 'Loud noises still make me jump', body: 'It has been two years and a door slamming still sends my heart racing. Does it get easier?', comments: [reply('sp-ptsd-2c1', 'SoftCurrent', 'wave', 'For me it softened slowly. Counting my breath helped a little. You are not overreacting.', now, 26)] }, now),
    mk(by('grief'), 1, { authorName: t(0).name, authorAvatar: 'leaf', authorKey: t(0).id, hoursAgo: 120, supports: 29, title: 'Welcome', body: 'Grief comes in waves. Some days are quiet and some knock you flat. You are welcome here either way.' }, now),
    mk(by('grief'), 2, { authorName: 'QuietPine', authorAvatar: 'pine', authorKey: 'p-quiet', hoursAgo: 12, supports: 24, title: 'First birthday without her', body: 'Tomorrow would have been my mother’s birthday. I don’t know how to get through it.' }, now),
    mk(by('anxiety'), 1, { authorName: t(1).name, authorAvatar: 'leaf', authorKey: t(1).id, hoursAgo: 90, supports: 22, title: 'Welcome', body: 'Anxiety is exhausting. Here you can say what is on your mind, and ask what others do on a hard day.' }, now),
    mk(by('depression'), 1, { authorName: t(3).name, authorAvatar: 'leaf', authorKey: t(3).id, hoursAgo: 100, supports: 27, title: 'Welcome', body: 'Some days the smallest thing is a win. Tell us yours.' }, now),
    mk(by('recovery'), 1, { authorName: t(4).name, authorAvatar: 'leaf', authorKey: t(4).id, hoursAgo: 110, supports: 19, title: 'Welcome', body: 'Recovery is not a straight line. Share where you are today.' }, now),
  ]
}
