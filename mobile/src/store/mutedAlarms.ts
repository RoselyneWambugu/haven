import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'echo.alarms.muted'
let ids: string[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

void AsyncStorage.getItem(KEY)
  .then((raw) => {
    const v = raw ? (JSON.parse(raw) as unknown) : []
    if (Array.isArray(v)) {
      ids = v.filter((x): x is string => typeof x === 'string')
      emit()
    }
  })
  .catch(() => undefined)

/** Silence or restore the reminders for one booking. Kept on this phone only. */
export function toggleMuted(id: string) {
  ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  emit()
  void AsyncStorage.setItem(KEY, JSON.stringify(ids)).catch(() => undefined)
}

/** The bookings whose bell the person switched off. Reminders are on for every booking until then. */
export function useMuted(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ids,
    () => ids,
  )
}
