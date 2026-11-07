import { useEffect, useState } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular'
import { Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces/400Regular_Italic'
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium'
import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular'
import { AtkinsonHyperlegibleNext_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular_Italic'
import { AtkinsonHyperlegibleNext_600SemiBold } from '@expo-google-fonts/atkinson-hyperlegible-next/600SemiBold'
import { AtkinsonHyperlegibleNext_700Bold } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold'
import { api, resumeBackground } from '@/api'
import { SecurityAlert } from '@/components/SecurityAlert'
import { ToastHost } from '@/components/ToastHost'
import { REMOTE } from '@/backend/client'
import { restoreSession } from '@/backend/remoteAuth'
import { getDb, loadDb, useDb } from '@/store/db'
import { MEMBERS_ON_WEB, WEB_PAGES } from '@/lib/webMembers'
import { SessionAlarmHost } from '@/components/SessionAlarmHost'
import { useFront } from '@/store/useFront'
import { useNow } from '@/store/useNow'
import { colors, LANDING_WIDTH, MAX_WIDTH, PORTAL_WIDTH } from '@/theme'

void SplashScreen.preventAutoHideAsync().catch(() => undefined)

/** Screens a person can reach without being signed in. Urgent help is always one of them. */
const SIGNED_OUT_OK = new Set(['welcome', 'who', 'landing', 'consent', 'register', 'otp', 'pen-name', 'languages', 'login', 'under-18', 'recovery', 'unlock', 'urgent', 'about', 'auth-callback', 'mobile-app', 'login-email', 'signup-email', 'forgot-password', 'reset-password'])
/** Signed-in people have no reason to be here (they would only land here with the back button). */
const SIGNED_IN_AWAY = new Set(['welcome', 'who', 'landing', 'consent', 'register', 'login', 'under-18'])
/** A paused account can still reach these (PRD SAF-15, ACC-18). */
const PAUSED_OK = new Set(['paused', 'urgent', 'help', 'plan', 'plans', 'refund', 'checkout', 'pay', 'settings', 'standing', 'appeal', 'about'])

function Gate() {
  const front = useFront()
  const segments = useSegments()
  const nav = useRootNavigationState()
  const signedIn = useDb((s) => s.signedIn)
  const locked = useDb((s) => s.locked)
  // A therapist or staff member signed in is not a signed-in member, but may open their sign-in methods.
  const proIn = useDb((s) => s.portal?.signedIn === true || s.admin?.signedIn === true)
  const paused = useDb((s) => s.account?.standing === 'paused')
  const first = (segments[0] as string | undefined) ?? ''

  useEffect(() => {
    if (!nav?.key) return
    // The therapist portal and the staff dashboard each have their own sign-in and guard.
    // On the live website members have no screens: anything that is not for therapists, staff or the public goes to the landing page.
    if (!MEMBERS_ON_WEB && first !== '' && first !== 'index' && !WEB_PAGES.has(first)) {
      router.replace('/landing' as never)
      return
    }
    if (first === 'portal' || first === 'staff' || first === 'admin') return
    if (first === 'settings' && proIn && !signedIn) return
    if (!signedIn) {
      if (!SIGNED_OUT_OK.has(first)) router.replace(front)
      return
    }
    if (locked) {
      if (first !== 'unlock' && first !== 'urgent') router.replace('/unlock')
      return
    }
    if (SIGNED_IN_AWAY.has(first)) {
      router.replace('/home')
      return
    }
    if (paused && !PAUSED_OK.has(first)) router.replace('/paused')
  }, [nav?.key, signedIn, locked, paused, first, front, proIn])
  return null
}

/** Locks the app after it has been in the background for the member's chosen time (PRD ACC-13). */
function useAppLock() {
  useEffect(() => {
    let leftAt: number | null = null
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background' || st === 'inactive') {
        if (leftAt === null) leftAt = Date.now()
        return
      }
      if (st === 'active' && leftAt !== null) {
        const away = (Date.now() - leftAt) / 1000
        leftAt = null
        const { signedIn, account } = getDb()
        if (signedIn && account?.settings.appLock && away >= account.settings.lockAfterSeconds) api.auth.lock()
      }
    })
    return () => sub.remove()
  }, [])
}

/** The member app is a phone-width column. The therapist portal and the staff dashboard are desktop web apps, so they get the full width. */
function Shell({ children }: { children: React.ReactNode }) {
  const first = useSegments()[0] as string | undefined
  const wide = first === 'portal' || first === 'staff' || first === 'landing'
  const maxWidth = first === 'landing' ? LANDING_WIDTH : PORTAL_WIDTH
  return (
    <View style={styles.backdrop}>
      <View style={[styles.column, wide ? { maxWidth } : null, Platform.OS === 'web' ? styles.columnWeb : null]}>{children}</View>
    </View>
  )
}

/** Creates time-based notifications (session and plan reminders, account notices) while the app is open. */
function Notifier() {
  const signedIn = useDb((s) => s.signedIn)
  const t = useNow()
  useEffect(() => {
    if (signedIn) {
      api.chat.sweep()
      api.groups.ensure()
      api.groups.tick()
      api.notify.sync()
    }
  }, [signedIn, t])
  return null
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_400Regular_Italic,
    AtkinsonHyperlegibleNext_600SemiBold,
    AtkinsonHyperlegibleNext_700Bold,
  })
  const [ready, setReady] = useState(false)
  useAppLock()

  useEffect(() => {
    // With the mock backend the browser tests can drive it directly. The real service is never exposed this way.
    if (Platform.OS === 'web' && !REMOTE) (globalThis as { __echo?: typeof api }).__echo = api
    // Without internet the saved account and chats still open: waiting for the live service is cut off after a few seconds and carries on in the background.
    const patient = (p: Promise<unknown>) => Promise.race([p.catch(() => undefined), new Promise((r) => setTimeout(r, 3500))])
    if (Platform.OS === 'web' && 'serviceWorker' in navigator && !__DEV__) void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    loadDb().then(() => (REMOTE ? patient(restoreSession()) : undefined)).then(() => {
      resumeBackground()
      setReady(true)
    })
  }, [])

  const show = (fontsLoaded || !!fontError) && ready
  useEffect(() => {
    if (show) void SplashScreen.hideAsync().catch(() => undefined)
  }, [show])

  if (!show) return null

  return (
    <SafeAreaProvider>
      <Shell>
        <Gate />
        <Notifier />
        <SessionAlarmHost />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'fade' }} />
        <ToastHost />
        <SecurityAlert />
      </Shell>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, backgroundColor: colors.paper },
  columnWeb: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
})
