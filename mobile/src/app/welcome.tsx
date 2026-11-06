import { useEffect, useRef } from 'react'
import { Animated, Easing, Platform, View, useWindowDimensions } from 'react-native'
import { Button } from '@/components/Button'
import { useReducedMotion } from '@/components/Art'
import { Bloom, Ornament } from '@/components/Bloom'
import { Screen, TopBar } from '@/components/Layout'
import { Text } from '@/components/Text'
import { useT } from '@/i18n'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

const native = Platform.OS !== 'web'
const WORD_MS = 110

/** One line of words that rise into place one after another. Still, and all at once, for anyone who prefers reduced motion. */
function Words({ text, start, reduced, italic, color }: { text: string; start: number; reduced: boolean; italic?: boolean; color: string }) {
  const words = text.split(' ')
  const v = useRef(words.map(() => new Animated.Value(reduced ? 1 : 0))).current
  useEffect(() => {
    if (reduced) return v.forEach((x) => x.setValue(1))
    const run = Animated.stagger(WORD_MS, v.map((x) => Animated.timing(x, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: native })))
    const t = setTimeout(() => run.start(), start)
    return () => {
      clearTimeout(t)
      run.stop()
    }
  }, [reduced, start, v])
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {words.map((w, i) => (
        <Animated.View key={i} style={{ opacity: v[i], transform: [{ translateY: v[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
          <Text variant="display" italic={italic} color={color} style={{ fontSize: 40, lineHeight: 44 }}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </Text>
        </Animated.View>
      ))}
    </View>
  )
}

/** The flower opens into place, then turns very slowly for as long as the screen is open. */
function Flower({ reduced }: { reduced: boolean }) {
  const { width } = useWindowDimensions()
  const w = Math.min(Math.max(width, 360) * 1.2, 620)
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current
  const idle = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduced) return enter.setValue(1)
    Animated.timing(enter, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start()
    const loop = Animated.loop(Animated.timing(idle, { toValue: 1, duration: 120_000, easing: Easing.linear, useNativeDriver: native }))
    loop.start()
    return () => loop.stop()
  }, [reduced, enter, idle])
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute', width: w, height: w * 1.12, right: -w * 0.4, top: -w * 0.28, opacity: enter,
        transform: [
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
          { rotate: enter.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) },
          { rotate: idle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
        ],
      }}
    >
      <Bloom background="transparent" glow={false} />
    </Animated.View>
  )
}

/** The first thing a person sees: a calm place and a plain promise. Get started asks who you are; signing in does not, because Echo already knows. */
export default function Welcome() {
  const t = useT()
  const reduced = useReducedMotion()
  const rest = useRef(new Animated.Value(reduced ? 1 : 0)).current
  useEffect(() => {
    if (reduced) return rest.setValue(1)
    const id = setTimeout(() => Animated.timing(rest, { toValue: 1, duration: 800, useNativeDriver: native }).start(), 2400)
    return () => clearTimeout(id)
  }, [reduced, rest])
  return (
    <Screen testID="welcome" dark scroll={false} header={<TopBar logo dark />} gap={16} backdrop={<Flower reduced={reduced} />}
      footer={
        <>
          <Button testID="get-started" variant="light" label={t('Get started')} onPress={() => go('/who')} />
          <Button testID="have-account" label={t('I already have an account')} variant="lightGhost" onPress={() => go('/login')} />
          <Text variant="caption" align="center" color={colors.lichen}>
            Echo is peer support, not emergency care.
          </Text>
        </>
      }
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 4, paddingBottom: 12 }}>
        <View accessibilityRole="header" accessibilityLabel={`${t('A space to speak.')} ${t('Someone to listen.')}`}>
          <Words text={t('A space to speak.')} start={500} reduced={reduced} color={colors.paper} />
          <Words text={t('Someone to listen.')} start={1300} reduced={reduced} italic color={colors.sun} />
        </View>
        <Animated.View style={{ opacity: rest, gap: 10, marginTop: 10 }}>
          <Ornament width={96} />
          <Text variant="body" color={colors.lichen}>
            Talk anonymously with people who understand, or with a verified therapist.
          </Text>
        </Animated.View>
      </View>
    </Screen>
  )
}
