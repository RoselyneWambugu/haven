const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Here since October 2026", or "Here since this month" for someone who joined in the month just gone. Always to the month, never the day. */
export function sinceLabel(since: number, now: number): string {
  const a = new Date(since)
  const b = new Date(now)
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (months <= 0) return 'Here since this month'
  return `Here since ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`
}

/** For the demo only: the start of a month between 1 and 14 months ago, chosen by the key so it is the same each time. */
export function demoSince(key: string, now: number): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (1 + (h % 14)), 1)
}
