import type { ForumPost } from '@/api/types'

/** Gossip is a section of the community. A gossip post is a post in this one built-in room, so it stays out of the general feed. */
export const GOSSIP_SPACE = 'gossip'
export const GOSSIP_TOPIC = 'Gossip'

export const isGossip = (p: Pick<ForumPost, 'space'>): boolean => p.space === GOSSIP_SPACE

export const GOSSIP_RULES = [
  'No names of real people. Say “a neighbour”, “someone at work”, “a friend of a friend”.',
  'No phone numbers, links or addresses, and nothing that points to one person.',
  'Gossip is for the latest talk, not for attacking anyone. Posts that do are removed.',
]

/** Words that start with a capital but are not a person: days, months, places, brands and common words. Kept in step with the server's list. */
export const NOT_NAMES = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'kenya', 'kenyan', 'kenyans', 'africa', 'african', 'nairobi', 'mombasa', 'kisumu', 'nakuru', 'eldoret', 'thika', 'kiambu', 'machakos', 'kitale', 'nyeri', 'meru', 'embu', 'garissa', 'malindi', 'naivasha', 'kakamega', 'kisii', 'kericho', 'bungoma', 'busia', 'siaya', 'migori', 'homa', 'narok', 'kajiado', 'lamu', 'diani', 'tanzania', 'uganda', 'rwanda', 'ethiopia', 'somalia', 'america', 'london', 'dubai',
  'echo', 'god', 'jesus', 'allah', 'christmas', 'easter', 'ramadan', 'eid', 'swahili', 'kiswahili', 'sheng', 'english', 'kikuyu', 'luo', 'luhya', 'kamba', 'kalenjin',
  'twitter', 'tiktok', 'instagram', 'facebook', 'whatsapp', 'youtube', 'netflix', 'google', 'telegram', 'snapchat', 'spotify', 'uber', 'bolt', 'safaricom', 'airtel', 'mpesa', 'equity', 'matatu', 'boda', 'nyama', 'ugali', 'chapo', 'sukuma',
  'the', 'this', 'that', 'there', 'they', 'then', 'when', 'what', 'who', 'why', 'how', 'yes', 'but', 'and', 'ndio', 'hapana', 'sasa', 'pole', 'asante',
]
const NOT_NAME = new Set(NOT_NAMES)

/**
 * Capitalised words in the middle of a sentence that are not on the safe list: most likely somebody's name. The first word of a sentence is
 * always a capital, so it is not counted. This is a guard, not a promise: the server checks the same way, and moderators handle what slips by.
 */
export function detectNames(input: string): string[] {
  const found: string[] = []
  for (const m of input.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
    const word = m[1]
    const before = input.slice(0, m.index ?? 0)
    if (/(^|[.!?:;"“(]\s*|\n\s*)$/.test(before)) continue // the first word of a sentence
    if (NOT_NAME.has(word.toLowerCase())) continue
    if (!found.includes(word)) found.push(word)
  }
  return found
}

export function explainNames(names: string[]): string {
  const list = names.slice(0, 3).map((n) => `“${n}”`).join(', ')
  return `That looks like a name (${list}). Leave names out, so nobody can be pointed at. Say “a neighbour” or “someone at work” instead.`
}

/** Gossip as it is shown: live posts, plus the member's own that are still being checked. Newest first. */
export function gossipFeed(posts: ForumPost[], hidden: string[] = [], muted: string[] = []): ForumPost[] {
  return posts
    .filter((p) => isGossip(p) && p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey) && (p.status === 'published' || p.mine))
    .sort((a, b) => b.createdAt - a.createdAt)
}
