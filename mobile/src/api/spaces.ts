import { SPACES, spaceById, spaceSeedPosts } from '@/data/spaces'
import { now } from '@/lib/clock'
import { getDb, update } from '@/store/db'
import type { Res } from './types'

/** Support spaces: groups for one issue each, such as domestic violence, PTSD or grief (PRD FRM and the community rules). */
export const spaces = {
  list: () => SPACES,

  isMember(id: string): boolean {
    return getDb().spaces.includes(id)
  },

  join(id: string): Res {
    const db = getDb()
    if (!db.account) return { ok: false, error: 'Sign in first.' }
    if (!spaceById(id)) return { ok: false, error: 'That space isn’t here.' }
    if (db.account.standing === 'paused') return { ok: false, error: 'Your account is paused.', code: 'paused' }
    if (!db.spaces.includes(id)) update((s) => ({ spaces: [...s.spaces, id] }))
    return { ok: true, value: undefined }
  },

  /** Leaving is always possible and tells nobody. The member's own posts stay, under their pen name. */
  leave(id: string): void {
    update((s) => ({ spaces: s.spaces.filter((x) => x !== id) }))
  },

  /** Adds the starter posts for each space once, so spaces are not empty. Safe to call on every start. */
  ensureSeeds(): void {
    const have = new Set(getDb().posts.map((p) => p.id))
    const add = spaceSeedPosts(now()).filter((p) => !have.has(p.id))
    if (add.length) update((s) => ({ posts: [...s.posts, ...add] }))
  },
}
