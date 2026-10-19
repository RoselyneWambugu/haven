/**
 * Kenya time (EAT, UTC+3, no daylight saving). Times are stored as epoch
 * milliseconds and formatted by hand, so the result is the same on every
 * device and JavaScript engine.
 */
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface EatParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  dow: number
}

export function eat(ms: number): EatParts {
  const d = new Date(ms + EAT_OFFSET_MS)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  }
}

/** Epoch ms for a given date and time in Kenya. */
export function fromEat(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month, day, hour, minute) - EAT_OFFSET_MS
}

const pad = (n: number) => String(n).padStart(2, '0')

export const clock = (ms: number) => {
  const p = eat(ms)
  return `${pad(p.hour)}:${pad(p.minute)}`
}
export const dayShort = (ms: number) => {
  const p = eat(ms)
  return `${DOW[p.dow]} ${p.day} ${MON[p.month]}`
}
export const dayLong = (ms: number) => {
  const p = eat(ms)
  return `${DOW_LONG[p.dow]} ${p.day} ${MON[p.month]}`
}
export const dayAndClock = (ms: number) => `${dayShort(ms)}, ${clock(ms)}`

export function startOfEatDay(ms: number): number {
  const p = eat(ms)
  return fromEat(p.year, p.month, p.day)
}

export function isSameEatDay(a: number, b: number): boolean {
  return startOfEatDay(a) === startOfEatDay(b)
}

export function relative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d`
  return dayShort(ms)
}

export function relativeLong(ms: number, now: number): string {
  const r = relative(ms, now)
  if (r === 'now') return 'just now'
  if (/ (min|h|d)$/.test(r)) {
    return r.replace(' min', ' minutes ago').replace(' h', ' hours ago').replace(' d', ' days ago')
  }
  return r
}
