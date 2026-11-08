import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'echo.alarms.start'
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

/** Turn the “alert me when it begins” alarm on or off for one group chat. Kept on this phone only. */
export function toggleStartAlert(id: string) {
  ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  emit()
  void AsyncStorage.setItem(KEY, JSON.stringify(ids)).catch(() => undefined)
}

/** The group chats the person asked to be alerted about when they begin. Off for every one until they ask. */
export function useStartAlerts(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ids,
    () => ids,
  )
}
