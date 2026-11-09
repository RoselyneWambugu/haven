import { useEffect, useRef } from 'react'
import { Animated, Easing, Platform, View } from 'react-native'
import { useReducedMotion } from '@/components/Art'
import { colors } from '@/theme'

/**
 * A thin loading bar: a gold piece that keeps sliding across the track while something loads. For anyone who asks their phone for less
 * motion it is a still, half-filled bar instead.
 */
export function LoadingBar({ width = 180, dark = false, testID = 'loading-bar' }: { width?: number; dark?: boolean; testID?: string }) {
  const reduced = useReducedMotion()
  const x = useRef(new Animated.Value(0)).current
  const piece = Math.round(width * 0.4)

  useEffect(() => {
    if (reduced) {
      x.setValue(0)
      return
    }
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }))
    loop.start()
    return () => loop.stop()
  }, [reduced, x])

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ width, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: dark ? 'rgba(242,235,221,0.2)' : colors.lichenDeep }}
    >
      <Animated.View
        style={{
          width: piece,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.sun,
          transform: [{ translateX: reduced ? Math.round((width - piece) / 2) : x.interpolate({ inputRange: [0, 1], outputRange: [-piece, width] }) }],
        }}
      />
    </View>
  )
}
