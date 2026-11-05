import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import type { Res } from '@/api/types'
import { supabase } from './client'

export type GooglePurpose = 'login' | 'register' | 'reauth' | 'link' | 'portal' | 'admin'

const KEY = 'echo.google.purpose'

WebBrowser.maybeCompleteAuthSession()

const failure = (error: string, code: string): Res<never> => ({ ok: false, error, code })

/** The public web address of Echo. Email links open in a browser, so on a phone this comes from the settings, not the app's own address. */
export function webBase(): string {
  if (Platform.OS === 'web') return globalThis.location.origin
  return (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://haven-three-xi.vercel.app').replace(/\/$/, '')
}

/** The address Google sends the person back to. On the web it is a page of this site; on a phone it is a link into the app. */
export function callbackUrl(): string {
  if (Platform.OS === 'web') return `${globalThis.location.origin}/auth-callback`
  return Linking.createURL('auth-callback')
}

/** Reads the one-time code Supabase put on the address Google sent the person back to, and turns it into a session. */
export async function exchange(url: string): Promise<Res> {
  const q = Linking.parse(url).queryParams ?? {}
  if (q.error || q.error_description) return failure('Google sign-in didn’t finish. Try again.', 'google')
  const code = typeof q.code === 'string' ? q.code : null
  if (!code) return failure('Google sign-in didn’t finish. Try again.', 'google')
  const { error } = await supabase().auth.exchangeCodeForSession(code)
  if (error) return failure('Google sign-in didn’t finish. Try again.', 'google')
  return { ok: true, value: undefined }
}

/** What the web page was doing when it left for Google. Read once: a second read (a repeated link) finds nothing. */
export async function takePurpose(): Promise<GooglePurpose | null> {
  try {
    const v = await AsyncStorage.getItem(KEY)
    await AsyncStorage.removeItem(KEY)
    return v === 'login' || v === 'register' || v === 'reauth' || v === 'link' || v === 'portal' || v === 'admin' ? v : null
  } catch {
    return null
  }
}

/**
 * Opens Google. On a phone this waits for the person to finish and returns once a session exists.
 * On the web the page itself goes to Google and comes back to /auth-callback, so this returns `redirecting`.
 */
export async function openGoogle(purpose: GooglePurpose): Promise<Res<{ redirecting: boolean }>> {
  const redirectTo = callbackUrl()
  const web = Platform.OS === 'web'
  const options = { redirectTo, skipBrowserRedirect: !web, queryParams: { prompt: purpose === 'reauth' ? 'login' : 'select_account' } }
  // Linking adds Google to the account that is signed in now, instead of signing in as whoever Google says.
  const { data, error } = purpose === 'link'
    ? await supabase().auth.linkIdentity({ provider: 'google', options })
    : await supabase().auth.signInWithOAuth({ provider: 'google', options })
  if (error || !data?.url) return failure('We couldn’t start Google sign-in. Try again in a moment.', 'google')
  if (web) {
    try { await AsyncStorage.setItem(KEY, purpose) } catch { /* the callback then treats the visit as a plain sign-in */ }
    return { ok: true, value: { redirecting: true } }
  }
  const r = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (r.type !== 'success') return failure('Google sign-in was cancelled.', 'cancelled')
  const done = await exchange(r.url)
  return done.ok ? { ok: true, value: { redirecting: false } } : done
}
