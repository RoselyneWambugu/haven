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
import { getDb, loadDb, useDb } from '@/store/db'
import { useFront } from '@/store/useFront'
import { colors, MAX_WIDTH, PORTAL_WIDTH } from '@/theme'

void SplashScreen.preventAutoHideAsync().catch(() => undefined)

/** Screens a person can reach without being signed in. Urgent help is always one of them. */
const SIGNED_OUT_OK = new Set(['welcome', 'landing', 'consent', 'register', 'otp', 'pen-name', 'languages', 'login', 'under-18', 'recovery', 'unlock', 'urgent', 'about'])
/** Signed-in people have no reason to be here (they would only land here with the back button). */
const SIGNED_IN_AWAY = new Set(['welcome', 'landing', 'consent', 'register', 'login', 'under-18'])
/** A paused account can still reach these (PRD SAF-15, ACC-18). */
const PAUSED_OK = new Set(['paused', 'urgent', 'help', 'plan', 'plans', 'checkout', 'pay', 'settings', 'standing', 'appeal', 'about'])

function Gate() {
  const front = useFront()
  const segments = useSegments()
  const nav = useRootNavigationState()
  const signedIn = useDb((s) => s.signedIn)
  const locked = useDb((s) => s.locked)
  const paused = useDb((s) => s.account?.standing === 'paused')
  const first = (segments[0] as string | undefined) ?? ''

  useEffect(() => {
    if (!nav?.key) return
    // The therapist portal and the admin dashboard each have their own sign-in and guard.
    if (first === 'portal' || first === 'admin') return
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
  }, [nav?.key, signedIn, locked, paused, first, front])
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

/** The member app is a phone-width column. The therapist portal and the admin dashboard are desktop web apps, so they get the full width. */
function Shell({ children }: { children: React.ReactNode }) {
  const first = useSegments()[0] as string | undefined
  const wide = first === 'portal' || first === 'admin' || first === 'landing'
  return (
    <View style={styles.backdrop}>
      <View style={[styles.column, wide ? { maxWidth: PORTAL_WIDTH } : null, Platform.OS === 'web' ? styles.columnWeb : null]}>{children}</View>
    </View>
  )
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
    // The backend is a mock, so on the web build the browser tests can drive it directly.
    if (Platform.OS === 'web') (globalThis as { __echo?: typeof api }).__echo = api
    loadDb().then(() => {
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
