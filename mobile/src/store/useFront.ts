import { Platform, useWindowDimensions } from 'react-native'

/** A wide browser window gets the landing page. Phones and narrow windows get the welcome screen. */
export function useFront(): '/landing' | '/welcome' {
  const w = useWindowDimensions().width
  return Platform.OS === 'web' && w >= 900 ? '/landing' : '/welcome'
}
