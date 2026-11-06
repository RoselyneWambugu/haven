import type { AvailabilityBlock, ForumComment, ForumPost, Peer, Therapist } from '@/api/types'

const H = 3600_000
const D = 24 * H

export const PEERS: Peer[] = [
  { id: 'p-silver', penName: 'SilverRiver', avatar: 'leaf', languages: ['English', 'Kiswahili'], ageBand: '25-34', topics: ['Grief', 'Loneliness'] },
  { id: 'p-rainy', penName: 'RainyDay', avatar: 'wave', languages: ['English'], ageBand: '25-34', topics: ['Anxiety', 'Wellbeing'] },
  { id: 'p-kind', penName: 'KindLeaf', avatar: 'fern', languages: ['English', 'Kiswahili'], ageBand: '35-44', topics: ['Work stress', 'Anxiety'] },
  { id: 'p-morning', penName: 'MorningSun', avatar: 'sun', languages: ['English'], ageBand: '18-24', topics: ['Wellbeing'] },
  { id: 'p-heron', penName: 'BlueHeron', avatar: 'drop', languages: ['English', 'Kiswahili'], ageBand: '25-34', topics: ['Relationships', 'Family'] },
  { id: 'p-fern', penName: 'GentleFern', avatar: 'fern', languages: ['English'], ageBand: '45-54', topics: ['Grief', 'Family'] },
  { id: 'p-star', penName: 'WanderingStar', avatar: 'star', languages: ['English', 'Kiswahili'], ageBand: '18-24', topics: ['Loneliness', 'Life changes'] },
  { id: 'p-pine', penName: 'SteadyPine', avatar: 'pine', languages: ['English', 'Kiswahili'], ageBand: '35-44', topics: ['Family', 'Grief'] },
  { id: 'p-quiet', penName: 'QuietPine', avatar: 'pine', languages: ['English'], ageBand: '25-34' },
]

const wk = (dow: number, start: string, end: string, modes: AvailabilityBlock['modes']): AvailabilityBlock => ({ dow, start, end, modes })
const ALL: AvailabilityBlock['modes'] = ['chat', 'voice', 'video']
const TXT: AvailabilityBlock['modes'] = ['chat', 'voice']

export const THERAPISTS: Therapist[] = [
  {
    id: 't-amina', name: 'Dr. Amina Otieno', title: 'Clinical psychologist', tone: 'a', gender: 'woman',
    bio: 'I help people feel heard and build practical coping skills for anxiety and loss.',
    specialisations: ['Anxiety', 'Grief', 'Relationships'], languages: ['English', 'Kiswahili'], modes: ALL,
    priceKes: 1500, rating: 4.8, reviews: 126, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '1234',
    licenceValidTo: Date.UTC(2027, 2, 31), acceptingNew: true,
    availability: [wk(1, '09:00', '12:00', ALL), wk(2, '14:00', '17:00', ALL), wk(3, '09:00', '12:00', ALL), wk(4, '14:00', '17:00', ALL), wk(5, '09:00', '12:00', TXT)],
  },
  {
    id: 't-james', name: 'James Mwangi', title: 'Counsellor', tone: 'b', gender: 'man',
    bio: 'A calm space to talk through work pressure and relationship difficulties.',
    specialisations: ['Relationships', 'Work stress'], languages: ['English'], modes: TXT,
    priceKes: 1200, rating: 4.7, reviews: 64, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '2210',
    licenceValidTo: Date.UTC(2027, 5, 30), acceptingNew: true,
    availability: [wk(1, '16:00', '19:00', TXT), wk(2, '09:00', '12:00', TXT), wk(4, '16:00', '19:00', TXT), wk(6, '10:00', '13:00', TXT)],
  },
  {
    id: 't-grace', name: 'Dr. Grace Wanjiru', title: 'Psychiatrist', tone: 'c', gender: 'woman',
    bio: 'I support people living with depression and anxiety, including medication questions.',
    specialisations: ['Depression', 'Anxiety', 'Trauma'], languages: ['English'], modes: ALL,
    priceKes: 2500, rating: 4.9, reviews: 88, licenceBody: 'Kenya Medical Practitioners and Dentists Council', licenceNumber: 'A-5521',
    licenceValidTo: Date.UTC(2027, 0, 31), acceptingNew: false,
    availability: [wk(3, '14:00', '18:00', ALL), wk(5, '14:00', '18:00', ALL)],
  },
  {
    id: 't-peter', name: 'Peter Ochieng', title: 'Counsellor', tone: 'd', gender: 'man',
    bio: 'I walk with people through grief and family change, at your pace.',
    specialisations: ['Grief', 'Family'], languages: ['English', 'Kiswahili'], modes: TXT,
    priceKes: 1000, rating: 4.6, reviews: 41, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '3017',
    licenceValidTo: Date.UTC(2026, 11, 3), acceptingNew: true,
    availability: [wk(1, '10:00', '13:00', TXT), wk(3, '15:00', '18:00', TXT), wk(5, '10:00', '13:00', TXT)],
  },
  {
    id: 't-faith', name: 'Faith Njeri', title: 'Counselling psychologist', tone: 'c', gender: 'woman',
    bio: 'Trauma-informed support for relationships, identity and big life changes.',
    specialisations: ['Trauma', 'Relationships', 'Life changes'], languages: ['English', 'Kiswahili'], modes: ALL,
    priceKes: 1800, rating: 4.8, reviews: 72, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '2894',
    licenceValidTo: Date.UTC(2027, 7, 31), acceptingNew: true,
    availability: [wk(2, '10:00', '13:00', ALL), wk(4, '10:00', '13:00', ALL), wk(6, '09:00', '12:00', ALL)],
  },
  {
    id: 't-hassan', name: 'Dr. Hassan Abdi', title: 'Clinical psychologist', tone: 'b', gender: 'man',
    bio: 'Evidence-based support for depression and anxiety, in your own language.',
    specialisations: ['Depression', 'Anxiety'], languages: ['English', 'Kiswahili'], modes: ['voice', 'video'],
    priceKes: 2000, rating: 4.7, reviews: 53, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '1980',
    licenceValidTo: Date.UTC(2027, 3, 30), acceptingNew: true,
    availability: [wk(1, '14:00', '18:00', ['voice', 'video']), wk(3, '09:00', '12:00', ['voice', 'video']), wk(4, '09:00', '12:00', ['voice', 'video'])],
  },
]

const c = (id: string, name: string, avatar: ForumComment['authorAvatar'], text: string, hoursAgo: number, now: number, th?: Therapist): ForumComment => ({
  id, authorName: name, authorAvatar: avatar, text, at: now - hoursAgo * H, hiddenReason: null, mine: false,
  therapistId: th?.id ?? null, therapistName: th?.name ?? null,
})

export function seedPosts(now: number): ForumPost[] {
  const amina = THERAPISTS[0]
  const grace = THERAPISTS[2]
  const mk = (p: Omit<ForumPost, 'mine' | 'supportedByMe' | 'status'>): ForumPost => ({ ...p, mine: false, supportedByMe: false, status: 'published' })
  return [
    mk({
      id: 'f1', authorName: 'RainyDay', authorAvatar: 'wave', authorKey: 'p-rainy', topic: 'Anxiety', createdAt: now - 2 * H, supports: 34,
      title: 'Struggling to sleep before exams',
      body: 'Every night my mind races about failing and I just lie awake. Has anyone found something that actually works?',
      comments: [
        c('f1c1', 'Dr. Amina Otieno', 'leaf', 'Racing thoughts at night are very common before exams. A short wind-down routine can help: dim lights, no screens for 30 minutes, and writing tomorrow’s worries on paper before bed. This is general information, not treatment for your situation.', 1, now, amina),
        c('f1c2', 'SilverRiver', 'leaf', 'Writing it down before bed helped me too. 💚', 1.2, now),
        { ...c('f1c3', 'BlueHeron', 'drop', '', 0.7, now), hiddenReason: 'contact' as const },
      ],
    }),
    mk({
      id: 'g1', space: 'gossip', authorName: 'SilverRiver', authorAvatar: 'leaf', authorKey: 'p-silver', topic: 'Gossip', createdAt: now - 3 * H, supports: 24,
      title: 'The new matatu fares have everyone talking',
      body: 'Half my estate says the new fares kicked in on Monday and the other half swears nothing has changed. Anyone actually paid more?',
      comments: [],
    }),
    mk({
      id: 'g2', space: 'gossip', authorName: 'BlueHeron', authorAvatar: 'drop', authorKey: 'p-heron', topic: 'Gossip', createdAt: now - 9 * H, supports: 41,
      title: 'Apparently a certain radio presenter is moving stations',
      body: 'Heard it from three different people today, so either it is true or it is the best rumour of the week. Nobody has confirmed anything yet.',
      comments: [],
    }),
    mk({
      id: 'g3', space: 'gossip', authorName: 'MorningSun', authorAvatar: 'sun', authorKey: 'p-morning', topic: 'Gossip', createdAt: now - 20 * H, supports: 17,
      title: 'Wedding season is out of control',
      body: 'Every weekend there is a send-off, a kamukunji and a wedding, and my group chat is only about what to wear. Is it just me or are the contributions getting bigger?',
      comments: [],
    }),
    { ...mk({
      id: 'pl1', space: 'polls', authorName: 'RainyDay', authorAvatar: 'wave', authorKey: 'p-rainy', topic: 'Polls', createdAt: now - 6 * H, supports: 0,
      title: 'What helps you unwind after a long day?', body: 'Poll: A long walk / Music / Sleep / Talking to someone', comments: [],
    }), poll: { options: [{ text: 'A long walk', votes: 41 }, { text: 'Music', votes: 58 }, { text: 'Sleep', votes: 33 }, { text: 'Talking to someone', votes: 27 }], myVote: null, closesAt: now + 5 * D } },
    { ...mk({
      id: 'pl2', space: 'polls', authorName: 'KindLeaf', authorAvatar: 'fern', authorKey: 'p-kind', topic: 'Polls', createdAt: now - 22 * H, supports: 0,
      title: 'Morning person or night owl?', body: 'Poll: Morning / Night / Depends on the day', comments: [],
    }), poll: { options: [{ text: 'Morning', votes: 64 }, { text: 'Night', votes: 49 }, { text: 'Depends on the day', votes: 71 }], myVote: null, closesAt: now + 6 * D } },
    { ...mk({
      id: 'pl3', space: 'polls', authorName: 'SteadyPine', authorAvatar: 'pine', authorKey: 'p-pine', topic: 'Polls', createdAt: now - 2 * D, supports: 0,
      title: 'Would you try a group walk with other members?', body: 'Poll: Yes / Maybe / Not for me', comments: [],
    }), poll: { options: [{ text: 'Yes', votes: 52 }, { text: 'Maybe', votes: 38 }, { text: 'Not for me', votes: 14 }], myVote: null, closesAt: now + 4 * D } },
    mk({
      id: 'f2', authorName: 'QuietPine', authorAvatar: 'pine', authorKey: 'p-quiet', topic: 'Grief', createdAt: now - 5 * H, supports: 51,
      title: 'Lost my dad last month',
      body: 'I don’t know how to explain it to people at work. Everyone says be strong and it makes me feel worse.',
      comments: [
        c('f2c1', 'GentleFern', 'fern', 'I am so sorry. You don’t have to be strong here. Take the time you need.', 4, now),
        c('f2c2', 'SteadyPine', 'pine', 'It took me a long time to tell people at work. Saying “I’m grieving” was enough.', 3, now),
      ],
    }),
    mk({
      id: 'f3', authorName: 'MorningSun', authorAvatar: 'sun', authorKey: 'p-morning', topic: 'Wellbeing', createdAt: now - 9 * H, supports: 40,
      title: 'Small win today',
      body: 'I went for a walk for the first time in weeks. Just wanted to share this with people who understand.',
      comments: [c('f3c1', 'KindLeaf', 'fern', 'That is a real win. Well done.', 8, now)],
    }),
    mk({
      id: 'f4', authorName: 'WanderingStar', authorAvatar: 'star', authorKey: 'p-star', topic: 'Loneliness', createdAt: now - 26 * H, supports: 22,
      title: 'Moved to a new city and know no one',
      body: 'Everything is new and the evenings are the hardest. How did you make it through the first months?',
      comments: [
        c('f4c1', 'Dr. Grace Wanjiru', 'leaf', 'Loneliness after a move is common and it does ease. Small, regular routines matter more than big gestures. General information only.', 20, now, grace),
        c('f4c2', 'BlueHeron', 'drop', 'Join one regular thing, even a weekly walk. It slowly adds up.', 22, now),
      ],
    }),
    mk({
      id: 'f5', authorName: 'KindLeaf', authorAvatar: 'fern', authorKey: 'p-kind', topic: 'Work stress', createdAt: now - 30 * H, supports: 18,
      title: 'Dreading Monday every Sunday',
      body: 'The weekend ends with a knot in my stomach. I am not sure if it is the job or me.',
      comments: [c('f5c1', 'RainyDay', 'wave', 'Same here. Writing down what exactly I dread helped me see it was the workload, not me.', 28, now)],
    }),
    mk({
      id: 'f6', authorName: 'SteadyPine', authorAvatar: 'pine', authorKey: 'p-pine', topic: 'Family', createdAt: now - 50 * H, supports: 15,
      title: 'Hard conversation with my mother',
      body: 'I want to tell her I’ve been struggling, but I’m afraid she will worry too much.',
      comments: [],
    }),
  ]
}
