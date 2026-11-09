import { View } from 'react-native'
import { LogoMark } from '@/components/Art'
import { LoadingBar } from '@/components/LoadingBar'

/**
 * What shows while Echo opens (before its fonts and saved data are ready): the logo and a moving loading bar on the same dark green as the
 * start-up image, so the change from the phone's own start-up screen is not noticed. It has no words, because the fonts aren't loaded yet.
 */
export function LoadingScreen({ onShown }: { onShown?: () => void }) {
  return (
    <View testID="loading-screen" onLayout={onShown} style={{ flex: 1, backgroundColor: '#102F27', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <LogoMark size={96} />
      <LoadingBar dark width={160} />
    </View>
  )
}
