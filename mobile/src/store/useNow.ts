import { useEffect, useState, useSyncExternalStore } from 'react'
import { clockVersion, now, subscribeClock } from '@/lib/clock'

/** The current time, refreshed every `everyMs` and whenever the demo clock moves. Use where a screen shows "join in 5 min". */
export function useNow(everyMs = 15_000): number {
  useSyncExternalStore(subscribeClock, clockVersion, clockVersion)
  const [, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), everyMs)
    return () => clearInterval(i)
  }, [everyMs])
  return now()
}
