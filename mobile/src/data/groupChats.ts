import type { ScriptLine } from '@/lib/groupChat'

export interface GroupTemplate {
  key: string
  topic: string
  blurb: string
  /** Index into the therapists list. */
  facilitator: number
  /** Days from today, and the hour in East Africa Time. */
  dayOffset: number
  hour: number
  durationMin: number
  capacity: number
  takenOthers: number
  rules: string[]
}

const RULES = [
  'A verified therapist leads the room. They are there to keep it kind and safe, and it is not therapy or advice for you.',
  'You are a pen name and an avatar. Never share contact details, places or names.',
  'Listen as much as you write. Everyone chooses how much to say.',
  'You can leave any time. Report any message that crosses a line. The chat is deleted 24 hours after it ends, unless a message was reported.',
]

export const GROUP_TEMPLATES: GroupTemplate[] = [
  {
    key: 'grief', topic: 'Surviving grief when everyone has moved on', blurb: 'The cards stopped arriving and people stopped asking. A gentle hour for anyone whose grief outlasted everyone else’s patience.',
    facilitator: 0, dayOffset: 1, hour: 14, durationMin: 60, capacity: 12, takenOthers: 7, rules: RULES,
  },
  {
    key: 'anxiety', topic: 'Sunday-night anxiety: quieting the worry before the week', blurb: 'An evening check-in for the worry that arrives before Monday does.',
    facilitator: 1, dayOffset: 2, hour: 19, durationMin: 45, capacity: 10, takenOthers: 5, rules: RULES,
  },
  {
    key: 'recovery', topic: 'Staying on track: a recovery check-in', blurb: 'Where are you today? A no-shame hour for people working on alcohol, drugs or other habits.',
    facilitator: 4, dayOffset: 3, hour: 18, durationMin: 60, capacity: 12, takenOthers: 4, rules: RULES,
  },
  {
    key: 'burnout', topic: 'Burnout and work stress: carrying it all', blurb: 'Exhausted, behind, and told to be grateful. Share how it feels and hear that you are not the only one.',
    facilitator: 3, dayOffset: 4, hour: 20, durationMin: 45, capacity: 10, takenOthers: 6, rules: RULES,
  },
]

const P = {
  a: { name: 'WarmLantern', avatar: 'sun' as const },
  b: { name: 'SoftCurrent', avatar: 'wave' as const },
  c: { name: 'EveningFern', avatar: 'fern' as const },
  d: { name: 'SteadyPine', avatar: 'pine' as const },
}
const f = (text: string): ScriptLine => ({ name: '', avatar: 'leaf', text, facilitator: true })
const p = (who: keyof typeof P, text: string): ScriptLine => ({ ...P[who], text })

/** What the room says, in order, so the demo has something to read. A real group has real people. */
export const SCRIPTS: Record<string, ScriptLine[]> = {
  grief: [
    f('Welcome, everyone. Thank you for being here. There is no right way to grieve, and nobody has to say anything. To begin: in a word or two, how are you arriving today?'),
    p('a', 'Tired. It has been eight months and people think I should be fine.'),
    p('b', 'Heavy, but glad to be somewhere I don’t have to explain.'),
    f('Thank you both. “Everyone has moved on” is one of the loneliest parts of grief. What would you have liked people to say or do?'),
    p('c', 'Just say his name. Everyone avoids it, like it will break me.'),
    p('d', 'Ask how I am, and then stay for the answer.'),
    f('That is clear and kind. Grief does not follow a timetable, and wanting your person’s name spoken is a very human thing to want.'),
    p('a', 'Hearing that helps. I thought something was wrong with me for still being so sad.'),
    f('Nothing is wrong with you. Be gentle with yourself this week. If it ever feels like too much, Urgent help is free and open any time.'),
  ],
  anxiety: [
    f('Welcome. This hour is for the worry that gathers on Sunday nights. You can write a lot or just read along. How is your mind tonight?'),
    p('b', 'Racing. I keep running through everything that could go wrong at work.'),
    p('c', 'My chest is tight. I do this every Sunday and I hate it.'),
    f('Thank you. You are not the only one who does this. When the worry starts, what is one thing that has helped, even a little?'),
    p('d', 'Writing the list down so it is on paper and not in my head.'),
    p('a', 'A slow walk, even just around the compound.'),
    f('Both are lovely examples. This is general information, not advice for you: many people find that naming a worry and putting it down for the night can soften it.'),
    p('b', 'I will try the list tonight.'),
    f('That sounds like a good plan. Thank you all for sharing.'),
  ],
  recovery: [
    f('Welcome, everyone. This is a no-shame space. Wherever you are today, you are welcome. How is it going?'),
    p('d', 'Day twelve. It is quiet but the evenings are hard.'),
    p('a', 'I slipped last weekend. I almost did not come.'),
    f('Thank you for coming anyway, that took courage. A slip is not the end of the road. What was happening just before?'),
    p('a', 'I was alone and bored and it felt like the only thing to do.'),
    p('c', 'Evenings are my hardest too. I started calling my sister then.'),
    f('Noticing the hard moments is a real skill. Plans for those moments can help, and you are doing the work by being here.'),
    p('d', 'Hearing that makes the evenings feel less scary.'),
    f('Thank you all. Keep going, one day at a time.'),
  ],
  burnout: [
    f('Welcome. Tonight is for anyone who is exhausted and still carrying everything. How are you feeling as you arrive?'),
    p('c', 'Drained. I am the only one who seems to care about deadlines.'),
    p('b', 'Behind, always. And told to be grateful to have a job.'),
    f('That is a hard combination. Feeling stretched does not mean you are failing. What is one thing that keeps you going?'),
    p('a', 'My lunch break outside. Twenty minutes of nothing.'),
    p('d', 'Switching my phone off after seven. It was scary the first time.'),
    f('Small boundaries add up. This is general information, not treatment: rest is part of working well, not the opposite of it.'),
    p('c', 'I think I forgot that. I will try the phone thing.'),
    f('Thank you all for being honest tonight. Look after yourselves.'),
  ],
}

export const CLOSING: Record<string, string> = {
  grief: 'Thank you for being here. This group chat has ended. It will be deleted in 24 hours. You are welcome back whenever you need.',
  anxiety: 'Thank you for being here. This group chat has ended. It will be deleted in 24 hours.',
  recovery: 'Thank you for being here. This group chat has ended. It will be deleted in 24 hours. Keep going.',
  burnout: 'Thank you for being here. This group chat has ended. It will be deleted in 24 hours. Take care of yourselves.',
}

/** For a group chat staff schedule, which has no standing script: the facilitator opens it, and members take it from there. */
export const GENERIC_SCRIPT: ScriptLine[] = [
  { name: '', avatar: 'leaf', facilitator: true, text: 'Welcome, everyone. Thank you for being here. There is no pressure to say anything, and you can write as much or as little as you like. When you are ready, tell us in a few words what brought you today.' },
]
export const GENERIC_CLOSING = 'Thank you for being here. This group chat has ended. It will be deleted in 24 hours.'
