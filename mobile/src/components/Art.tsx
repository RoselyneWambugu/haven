import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg'
import type { AvatarKind, PortraitTone } from '@/api/types'
import { colors } from '@/theme'

// ---------------------------------------------------------------------------
// Avatars: drawn marks, never photos (PRD PRF-1)
// ---------------------------------------------------------------------------

const AVATAR_COLORS: Record<AvatarKind, { bg: string; fg: string }> = {
  moon: { bg: '#E5C98C', fg: '#4A3512' },
  leaf: { bg: '#C3D6A8', fg: '#2C4F37' },
  wave: { bg: '#B7D2CF', fg: '#1F4A48' },
  star: { bg: '#F3D9B0', fg: '#6B3F0A' },
  pine: { bg: '#A9C9A0', fg: '#1C372A' },
  sun: { bg: '#F6DDB0', fg: '#8A4B0C' },
  fern: { bg: '#D1E0B8', fg: '#2C4F37' },
  drop: { bg: '#C9DDE3', fg: '#23495A' },
}

export const AVATAR_KINDS = Object.keys(AVATAR_COLORS) as AvatarKind[]

function Glyph({ kind, color }: { kind: AvatarKind; color: string }) {
  switch (kind) {
    case 'moon': return <Path d="M15 4a8 8 0 1 0 5 12A7 7 0 0 1 15 4z" fill={color} />
    case 'leaf': return <Path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15z" fill={color} />
    case 'wave': return <Path d="M3 13c3-5 6 5 9 0s6 5 9 0" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    case 'star': return <Path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z" fill={color} />
    case 'pine': return (<><Path d="M12 3l5 7h-3l4 6H6l4-6H7z" fill={color} /><Rect x={11} y={16} width={2} height={4} fill={color} /></>)
    case 'sun': return (<><Circle cx={12} cy={12} r={4} fill={color} /><Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" stroke={color} strokeWidth={2} strokeLinecap="round" /></>)
    case 'fern': return (<><Path d="M12 21V4" stroke={color} strokeWidth={2} strokeLinecap="round" /><Path d="M12 8c-3 0-5-1-6-3 3-1 5 0 6 3zM12 8c3 0 5-1 6-3-3-1-5 0-6 3zM12 13c-3 0-5-1-6-3 3-1 5 0 6 3zM12 13c3 0 5-1 6-3-3-1-5 0-6 3z" fill={color} /></>)
    case 'drop': return <Path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill={color} />
  }
}

export function Avatar({ kind, size = 44, ring = true }: { kind: AvatarKind; size?: number; ring?: boolean }) {
  const c = AVATAR_COLORS[kind]
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center',
        borderWidth: ring ? 2 : 0, borderColor: colors.paper,
        ...(ring ? { shadowColor: colors.lichenDeep, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } } : null),
      }}
    >
      <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
        <Glyph kind={kind} color={c.fg} />
      </Svg>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Portraits: arch-framed illustrated placeholders for therapists (real photos come later, D49)
// ---------------------------------------------------------------------------

const TONES: Record<PortraitTone, [string, string, string]> = {
  a: ['#C3D6A8', '#2C4F37', '#1C372A'],
  b: ['#F3D9B0', '#7C5A2E', '#3B2A14'],
  c: ['#B7D2CF', '#2E5E5A', '#17302E'],
  d: ['#E5C9C0', '#8A4B3C', '#40201A'],
}

export function Portrait({ tone, width, height, style }: { tone: PortraitTone; width: number; height: number; style?: ViewStyle }) {
  const [bg, body, head] = TONES[tone]
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, overflow: 'hidden', borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, backgroundColor: bg }, style]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 120" preserveAspectRatio="xMidYMid slice">
        <Rect width={100} height={120} fill={bg} />
        <Path d="M-5 120c4-26 22-38 55-38s51 12 55 38z" fill={body} />
        <Circle cx={50} cy={52} r={20} fill={head} />
        <Path d="M30 46c2-16 16-22 30-18 8 3 12 9 11 18-8-7-20-9-41 0z" fill={body} opacity={0.9} />
      </Svg>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Landscape: the drawn scene used instead of stock photography (D45)
// ---------------------------------------------------------------------------

export function Scene({ sun = [264, 120], sky = colors.lichen, pond = true }: { sun?: [number, number]; sky?: string; pond?: boolean }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 480" preserveAspectRatio="xMidYMid slice" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width={400} height={480} fill={sky} />
      <Circle cx={sun[0]} cy={sun[1]} r={70} fill="#F0A34A" opacity={0.18} />
      <Circle cx={sun[0]} cy={sun[1]} r={46} fill="#F0A34A" />
      <Path d="M-10 300c60-50 120-54 190-20 70 34 140 10 230-30v230H-10z" fill="#A9C9A0" />
      <Path d="M-10 340c80-36 150-30 220 0s130 24 200-10v150H-10z" fill="#5E8A5B" />
      <Path d="M-10 380c90-26 170-18 250 4s120 8 170-6v110H-10z" fill="#2C4F37" />
      {pond && (
        <G fill="none" stroke="#DDE7CB" strokeWidth={1.6}>
          <Ellipse cx={200} cy={430} rx={40} ry={8} opacity={0.7} />
          <Ellipse cx={200} cy={430} rx={76} ry={15} opacity={0.5} />
          <Ellipse cx={200} cy={430} rx={118} ry={23} opacity={0.32} />
          <Ellipse cx={200} cy={430} rx={164} ry={32} opacity={0.18} />
        </G>
      )}
      <Path d="M40 330c-6-30 2-60 8-84 8 24 14 52 8 84z" fill="#1C372A" />
      <Path d="M70 340c-4-22 2-44 6-60 6 16 10 38 6 60z" fill="#2C4F37" />
      <Path d="M352 392c-4-40 2-80 10-110" stroke="#1C372A" strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M362 292c-14-4-22 2-28 12M358 318c14-6 24-2 32 8M356 344c-12-6-22-2-30 6" stroke="#1C372A" strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export function LogoMark({ size = 26, color = colors.fern }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={16} cy={16} r={3} fill={colors.sun} />
      <Path d="M10.5 10.5a7.8 7.8 0 0 0 0 11" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M21.5 10.5a7.8 7.8 0 0 1 0 11" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M6.4 6.6a13.4 13.4 0 0 0 0 18.8" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
      <Path d="M25.6 6.6a13.4 13.4 0 0 1 0 18.8" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// Mood faces (Home check-in)
// ---------------------------------------------------------------------------

export type Mood = 1 | 2 | 3 | 4 | 5

export function Face({ mood, selected, size = 44 }: { mood: Mood; selected?: boolean; size?: number }) {
  const bg = selected ? colors.moss : colors.lichen
  const fg = selected ? colors.white : colors.mossDeep
  const mouth = { 1: 'M13 31q7-6 14 0', 2: 'M13 30h14', 3: 'M13 29q7 3 14 0', 4: 'M12 28q8 7 16 0', 5: '' }[mood]
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={20} cy={20} r={19} fill={bg} />
      <Circle cx={14.5} cy={19} r={2.2} fill={fg} />
      <Circle cx={25.5} cy={19} r={2.2} fill={fg} />
      {mood === 1 && <Path d="M10.5 15.5l6-3M29.5 15.5l-6-3" stroke={fg} strokeWidth={2} strokeLinecap="round" />}
      {mood === 5 ? <Path d="M11 25.5h18c0 6.5-4 10.5-9 10.5s-9-4-9-10.5z" fill={fg} /> : <Path d={mouth} fill="none" stroke={fg} strokeWidth={2.4} strokeLinecap="round" />}
    </Svg>
  )
}

// ---------------------------------------------------------------------------
// The ripple: the signature motion. Slow, and still for anyone who prefers reduced motion.
// ---------------------------------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduced(v)).catch(() => undefined)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return reduced
}

export function useBreath(): Animated.Value {
  const v = useRef(new Animated.Value(0)).current
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced) {
      v.setValue(0.5)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, v])
  return v
}

function Ring({ delay, size, color, reduced, index }: { delay: number; size: number; color: string; reduced: boolean; index: number }) {
  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduced) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 6000, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [delay, reduced, t])
  const scale = reduced ? 1.2 + index * 0.8 : t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3.4] })
  const opacity = reduced ? 0.35 - index * 0.1 : t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.5, 0] })
  return (
    <Animated.View
      style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, opacity, transform: [{ scale }] }}
    />
  )
}

/** Concentric rings that spread and fade from the centre. Used while waiting, on calls, and for calm. */
export function Ripple({ size = 120, color = colors.lichenDeep, still = false }: { size?: number; color?: string; still?: boolean }) {
  const reduced = useReducedMotion() || still
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 2000, 4000].map((d, i) => (
        <Ring key={d} delay={d} size={size} color={color} reduced={reduced} index={i} />
      ))}
    </View>
  )
}
