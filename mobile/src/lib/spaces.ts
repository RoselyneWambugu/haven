import type { ForumPost } from '@/api/types'
import type { Space } from '@/data/spaces'

/** A sensitive space can be read only by members who joined. Other spaces can be read by anyone, but posting needs a join. */
export const canRead = (space: Pick<Space, 'id' | 'sensitive'>, joined: string[]): boolean => !space.sensitive || joined.includes(space.id)

/** A post in a sensitive space is always checked before it goes live, not only a member's first (PRD FRM-5). */
export const needsCheck = (space: Pick<Space, 'sensitive'> | undefined, hasPostedBefore: boolean): boolean => !hasPostedBefore || !!space?.sensitive

/** Posts shown in one space: published ones, plus the member's own that are still being checked. Newest first. */
export function spaceFeed(posts: ForumPost[], spaceId: string, hidden: string[] = [], muted: string[] = []): ForumPost[] {
  return posts
    .filter((p) => p.space === spaceId && p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey) && (p.status === 'published' || p.mine))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** The general community feed leaves space posts out, so what is said in a sensitive space stays in it. */
export const generalPosts = (posts: ForumPost[]): ForumPost[] => posts.filter((p) => !p.space)
