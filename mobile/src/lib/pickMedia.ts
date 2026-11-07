import * as DocumentPicker from 'expo-document-picker'
import type { PickedFile } from '@/backend/remoteDocuments'
import { POSTER_TYPES, VIDEO_TYPES } from '@/backend/remoteEpisodes'

async function pick(types: string[]): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false })
  if (r.canceled || !r.assets?.[0]) return null
  const a = r.assets[0]
  return { name: a.name, size: a.size ?? 0, mime: a.mimeType ?? '', uri: a.uri, file: (a as { file?: Blob }).file }
}

/** Opens the file chooser for an episode's video (MP4, MOV or WebM). Null when the person backs out. */
export const pickVideo = (): Promise<PickedFile | null> => pick(VIDEO_TYPES)
/** Opens the file chooser for an episode's picture (JPEG, PNG or WebP). */
export const pickPoster = (): Promise<PickedFile | null> => pick(POSTER_TYPES)

/** On the website, reads how long a video is without uploading it. Elsewhere (or if it can't be read) null. */
export function videoDuration(f: PickedFile): Promise<number | null> {
  const w = globalThis as unknown as { document?: Document; URL?: typeof URL }
  if (!f.file || !w.document || !w.URL?.createObjectURL) return Promise.resolve(null)
  return new Promise((resolve) => {
    const v = w.document!.createElement('video')
    const url = w.URL!.createObjectURL(f.file as Blob)
    const done = (n: number | null) => {
      w.URL!.revokeObjectURL(url)
      resolve(n)
    }
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration) : null)
    v.onerror = () => done(null)
    v.src = url
  })
}
