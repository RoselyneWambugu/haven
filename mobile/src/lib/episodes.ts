import type { Episode } from '@/api/types'

/** "31 min", "1 h 02 min". Null when the length isn't known. */
export function durationLabel(sec: number | null | undefined): string | null {
  if (!sec || sec < 1) return null
  const mins = Math.max(1, Math.round(sec / 60))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** The newest episode first. The first one is shown large, the rest as a list. */
export function newestFirst(list: Episode[]): { latest: Episode | null; earlier: Episode[] } {
  const sorted = [...list].sort((a, b) => b.publishedAt - a.publishedAt)
  return { latest: sorted[0] ?? null, earlier: sorted.slice(1) }
}

/** A file size for staff: "812 MB", "1.4 GB". */
export function sizeLabel(bytes: number | null | undefined): string | null {
  if (!bytes || bytes < 1) return null
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}
