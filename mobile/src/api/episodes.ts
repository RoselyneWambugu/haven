import { DEMO_VIDEO, demoEpisodes } from '@/data/episodes'
import { now } from '@/lib/clock'
import { requirePlan } from './access'
import type { PickedFile } from '@/backend/remoteDocuments'
import type { Episode, EpisodePlay, Res, StaffEpisode } from './types'

/** What staff give to add an episode: the words, the video file, and an optional picture. */
export interface NewEpisode {
  title: string
  blurb: string
  video: PickedFile
  poster?: PickedFile | null
  durationSec?: number | null
}

const LIVE_ONLY: Res<never> = { ok: false, error: 'Adding episodes is only on the live service.', code: 'unavailable' }

/** Watch in the demo: three sample episodes that all play the same short public clip. Nothing is uploaded. */
export const episodes = {
  /** The published episodes, newest first. Needs an active plan, like the rest of Echo. */
  async list(): Promise<Res<Episode[]>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<Episode[]>
    return { ok: true, value: demoEpisodes(now()) }
  },

  /** One episode, ready to play. */
  async play(id: string): Promise<Res<EpisodePlay>> {
    const gate = requirePlan('Watch')
    if (gate) return gate as Res<EpisodePlay>
    const e = demoEpisodes(now()).find((x) => x.id === id)
    if (!e) return { ok: false, error: 'That episode isn’t available.', code: 'gone' }
    return { ok: true, value: { title: e.title, blurb: e.blurb, durationSec: e.durationSec, videoUrl: DEMO_VIDEO, posterUrl: null } }
  },

  /** Staff: every episode. In the demo they are the sample ones and can't be changed. */
  async staffList(): Promise<Res<StaffEpisode[]>> {
    return {
      ok: true,
      value: demoEpisodes(now()).map((e) => ({ id: e.id, title: e.title, blurb: e.blurb, status: 'published' as const, durationSec: e.durationSec, sizeBytes: null, publishedAt: e.publishedAt, createdBy: 'Demo', createdAt: e.publishedAt })),
    }
  },

  async add(_input: NewEpisode, _onProgress?: (pct: number) => void): Promise<Res<{ id: string }>> {
    return LIVE_ONLY
  },
  async edit(_id: string, _title: string, _blurb: string): Promise<Res> {
    return LIVE_ONLY
  },
  async setPublished(_id: string, _publish: boolean): Promise<Res> {
    return LIVE_ONLY
  },
}
