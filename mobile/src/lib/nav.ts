import { router } from 'expo-router'

/** Go back if there is somewhere to go back to, otherwise land on a sensible screen. */
export function goBack(fallback: string = '/home'): void {
  if (router.canGoBack()) router.back()
  else router.replace(fallback as never)
}

export const go = (path: string): void => router.push(path as never)
export const replace = (path: string): void => router.replace(path as never)

/** Start a fresh stack at `path`, so the back button can't return to a finished flow. */
export function resetTo(path: string): void {
  if (router.canDismiss()) router.dismissAll()
  router.replace(path as never)
}
