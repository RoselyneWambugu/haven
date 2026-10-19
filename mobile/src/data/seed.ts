import type { AvailabilityBlock, ForumComment, ForumPost, Peer, Therapist } from '@/api/types'

const H = 3600_000

export const PEERS: Peer[] = [
  { id: 'p-silver', penName: 'SilverRiver', avatar: 'leaf', languages: ['English', 'Kiswahili'], ageBand: '25-34' },
  { id: 'p-rainy', penName: 'RainyDay', avatar: 'wave', languages: ['English'], ageBand: '25-34' },
  { id: 'p-kind', penName: 'KindLeaf', avatar: 'fern', languages: ['English', 'Kiswahili'], ageBand: '35-44' },
  { id: 'p-morning', penName: 'MorningSun', avatar: 'sun', languages: ['English', 'Sheng'], ageBand: '18-24' },
  { id: 'p-heron', penName: 'BlueHeron', avatar: 'drop', languages: ['English', 'Kiswahili'], ageBand: '25-34' },
  { id: 'p-fern', penName: 'GentleFern', avatar: 'fern', languages: ['English', 'Kikuyu'], ageBand: '45-54' },
  { id: 'p-star', penName: 'WanderingStar', avatar: 'star', languages: ['English', 'Kiswahili'], ageBand: '18-24' },
  { id: 'p-pine', penName: 'SteadyPine', avatar: 'pine', languages: ['English', 'Dholuo'], ageBand: '35-44' },
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
    specialisations: ['Depression', 'Anxiety', 'Trauma'], languages: ['English', 'Kikuyu'], modes: ALL,
    priceKes: 2500, rating: 4.9, reviews: 88, licenceBody: 'Kenya Medical Practitioners and Dentists Council', licenceNumber: 'A-5521',
    licenceValidTo: Date.UTC(2027, 0, 31), acceptingNew: false,
    availability: [wk(3, '14:00', '18:00', ALL), wk(5, '14:00', '18:00', ALL)],
  },
  {
    id: 't-peter', name: 'Peter Ochieng', title: 'Counsellor', tone: 'd', gender: 'man',
    bio: 'I walk with people through grief and family change, at your pace.',
    specialisations: ['Grief', 'Family'], languages: ['English', 'Dholuo'], modes: TXT,
    priceKes: 1000, rating: 4.6, reviews: 41, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '3017',
    licenceValidTo: Date.UTC(2026, 11, 3), acceptingNew: true,
    availability: [wk(1, '10:00', '13:00', TXT), wk(3, '15:00', '18:00', TXT), wk(5, '10:00', '13:00', TXT)],
  },
  {
    id: 't-faith', name: 'Faith Njeri', title: 'Counselling psychologist', tone: 'c', gender: 'woman',
    bio: 'Trauma-informed support for relationships, identity and big life changes.',
    specialisations: ['Trauma', 'Relationships', 'Life changes'], languages: ['English', 'Kiswahili', 'Kikuyu'], modes: ALL,
    priceKes: 1800, rating: 4.8, reviews: 72, licenceBody: 'Counsellors and Psychologists Board', licenceNumber: '2894',
    licenceValidTo: Date.UTC(2027, 7, 31), acceptingNew: true,
    availability: [wk(2, '10:00', '13:00', ALL), wk(4, '10:00', '13:00', ALL), wk(6, '09:00', '12:00', ALL)],
  },
  {
    id: 't-hassan', name: 'Dr. Hassan Abdi', title: 'Clinical psychologist', tone: 'b', gender: 'man',
    bio: 'Evidence-based support for depression and anxiety, in your own language.',
    specialisations: ['Depression', 'Anxiety'], languages: ['English', 'Kiswahili', 'Somali'], modes: ['voice', 'video'],
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
