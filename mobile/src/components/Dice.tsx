import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, View } from 'react-native'
import { colors } from '@/theme'
import { useReducedMotion } from './Art'

/** Where the pips sit on a 3 by 3 grid, for each face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function Face({ n, size }: { n: number; size: number }) {
  const pad = size * 0.16
  const cell = (size - pad * 2) / 3
  const pip = size * 0.15
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: colors.moss, borderWidth: 2, borderColor: colors.mossDeep }}>
      {PIPS[n].map(([r, c]) => (
        <View
          key={`${r}${c}`}
          style={{ position: 'absolute', left: pad + c * cell + (cell - pip) / 2, top: pad + r * cell + (cell - pip) / 2, width: pip, height: pip, borderRadius: pip / 2, backgroundColor: colors.paper }}
        />
      ))}
    </View>
  )
}

/**
 * A die that tumbles while Echo looks for someone, then settles. The face changes as it rolls, it bounces and spins,
 * and it stays still for anyone who prefers less motion. It is decoration: matching never depends on it.
 */
export function Dice({ size = 92, rolling, landOn = 6 }: { size?: number; rolling: boolean; landOn?: number }) {
  const reduced = useReducedMotion()
  const spin = useRef(new Animated.Value(0)).current
  const hop = useRef(new Animated.Value(0)).current
  const [face, setFace] = useState(landOn)
  const native = Platform.OS !== 'web'

  useEffect(() => {
    if (reduced || !rolling) {
      setFace(landOn)
      spin.setValue(0)
      hop.setValue(0)
      return
    }
    const tumble = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }))
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 330, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(hop, { toValue: 0, duration: 330, easing: Easing.in(Easing.quad), useNativeDriver: native }),
      ]),
    )
    tumble.start()
    bounce.start()
    let last = 0
    const flip = setInterval(() => {
      let n = 1 + Math.floor(Math.random() * 6)
      if (n === last) n = (n % 6) + 1
      last = n
      setFace(n)
    }, 150)
    return () => {
      tumble.stop()
      bounce.stop()
      clearInterval(flip)
    }
  }, [rolling, reduced, landOn, spin, hop, native])

  // Settling: a small wobble as it comes to rest.
  useEffect(() => {
    if (reduced || rolling) return
    Animated.sequence([
      Animated.timing(spin, { toValue: 0.06, duration: 120, useNativeDriver: native }),
      Animated.spring(spin, { toValue: 0, friction: 4, tension: 120, useNativeDriver: native }),
    ]).start()
  }, [rolling, reduced, spin, native])

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const translateY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.28] })
  const shadow = hop.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] })

  return (
    <View testID="dice" accessible accessibilityLabel={rolling ? 'Rolling the dice while we look for someone' : 'Dice'} style={{ width: size * 1.6, height: size * 1.5, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>
        <Face n={face} size={size} />
      </Animated.View>
      <Animated.View style={{ marginTop: size * 0.12, width: size * 0.8, height: size * 0.1, borderRadius: size, backgroundColor: colors.lichenDeep, opacity: shadow, transform: [{ scaleX: shadow }] }} />
    </View>
  )
}
