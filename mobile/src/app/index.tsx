import { Redirect } from 'expo-router'
import { Platform } from 'react-native'
import { useDb } from '@/store/db'
import { useFront } from '@/store/useFront'

/** Set EXPO_PUBLIC_WEB_FRONT=portal on the hosted web app so it opens on the therapist dashboard. Members use the phone app. */
const WEB_OPENS_PORTAL = Platform.OS === 'web' && process.env.EXPO_PUBLIC_WEB_FRONT === 'portal'

export default function Index() {
  const signedIn = useDb((s) => s.signedIn)
  const front = useFront()
  if (WEB_OPENS_PORTAL) return <Redirect href={'/portal' as never} />
  return <Redirect href={signedIn ? '/home' : front} />
}
