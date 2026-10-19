/** One place for "now", so demos can move time forward (for example to open a session's join window). */
let offsetMs = 0
const listeners = new Set<() => void>()
let version = 0
const bump = () => {
  version += 1
  listeners.forEach((l) => l())
}

export const now = (): number => Date.now() + offsetMs
export const advanceClock = (minutes: number): void => {
  offsetMs += minutes * 60_000
  bump()
}
export const resetClock = (): void => {
  offsetMs = 0
  bump()
}
/** Lets screens re-render when the demo clock moves. */
export const subscribeClock = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const clockVersion = (): number => version
