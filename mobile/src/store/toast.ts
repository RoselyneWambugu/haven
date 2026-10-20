import { useSyncExternalStore } from 'react'

export interface ToastMsg {
  id: number
  text: string
}

let current: ToastMsg | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

export function showToast(text: string, ms = 3500): void {
  seq += 1
  current = { id: seq, text }
  listeners.forEach((l) => l())
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    current = null
    listeners.forEach((l) => l())
  }, ms)
}

export function useToast(): ToastMsg | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
    () => current,
  )
}
