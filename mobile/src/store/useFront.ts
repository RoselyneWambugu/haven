import { Platform, useWindowDimensions } from 'react-native'
import { MEMBERS_ON_WEB } from '@/lib/webMembers'

/** A wide browser window gets the landing page. Phones and narrow windows get the welcome screen. */
export function useFront(): '/landing' | '/welcome' {
  const w = useWindowDimensions().width
  // On the live website there is no member app, so every window opens the landing page.
  if (!MEMBERS_ON_WEB) return '/landing'
  return Platform.OS === 'web' && w >= 900 ? '/landing' : '/welcome'
}
