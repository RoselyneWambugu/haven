/** One place for "now", so demos can move time forward (for example to open a session's join window). */
let offsetMs = 0
export const now = (): number => Date.now() + offsetMs
export const advanceClock = (minutes: number): void => {
  offsetMs += minutes * 60_000
}
export const resetClock = (): void => {
  offsetMs = 0
}
