import { Redirect } from 'expo-router'
import { Platform } from 'react-native'
import { useDb } from '@/store/db'
import { useFront } from '@/store/useFront'

/** A signed-in therapist on the web opens on their dashboard. Everyone else opens the landing page (or the welcome screen on a phone). */
export default function Index() {
  const signedIn = useDb((s) => s.signedIn)
  const therapistIn = useDb((s) => s.portal?.signedIn ?? false)
  const front = useFront()
  if (Platform.OS === 'web' && therapistIn) return <Redirect href={'/portal/today' as never} />
  return <Redirect href={signedIn ? '/home' : front} />
}
