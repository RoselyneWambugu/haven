import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, RadialGradient, Stop } from 'react-native-svg'
import { View } from 'react-native'
import { colors } from '@/theme'

/**
 * The brand flower: dark emerald petals behind pale ivory ones, with a gold centre. It is drawn, not photographed, so it is crisp at any
 * size and weighs nothing. It sits on a forest-green panel.
 */
export function Bloom({ background = colors.fern }: { background?: string }) {
  const cx = 250
  const cy = 262
  const turn = (deg: number) => `rotate(${deg} ${cx} ${cy})`
  const back = Array.from({ length: 9 }, (_, i) => i * 40 + 6)
  const mid = Array.from({ length: 9 }, (_, i) => i * 40 + 26)
  const stamens = Array.from({ length: 28 }, (_, i) => i * (360 / 28))
  return (
    <Svg width="100%" height="100%" viewBox="0 0 500 560" preserveAspectRatio="xMidYMid slice" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="bloom-glow" cx="50%" cy="48%" r="60%">
          <Stop offset="0" stopColor="#B08A4F" stopOpacity="0.34" />
          <Stop offset="1" stopColor="#B08A4F" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="bloom-back" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1F6B55" />
          <Stop offset="1" stopColor="#0E3A2D" />
        </LinearGradient>
        <LinearGradient id="bloom-ivory" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBF6EA" />
          <Stop offset="1" stopColor="#D9C9A5" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={270} ry={290} fill={background} />
      <Ellipse cx={cx} cy={cy} rx={270} ry={290} fill="url(#bloom-glow)" />
      {back.map((a) => (
        <G key={`b${a}`} transform={turn(a)}>
          <Ellipse cx={cx} cy={cy - 118} rx={58} ry={134} fill="url(#bloom-back)" stroke="#78947F" strokeOpacity={0.35} strokeWidth={1.4} />
          <Line x1={cx} y1={cy - 30} x2={cx} y2={cy - 238} stroke="#78947F" strokeOpacity={0.3} strokeWidth={1} />
        </G>
      ))}
      {mid.map((a) => (
        <G key={`m${a}`} transform={turn(a)}>
          <Ellipse cx={cx} cy={cy - 84} rx={40} ry={96} fill="url(#bloom-ivory)" stroke="#B08A4F" strokeOpacity={0.7} strokeWidth={1.4} />
          <Line x1={cx} y1={cy - 24} x2={cx} y2={cy - 168} stroke="#B08A4F" strokeOpacity={0.45} strokeWidth={1} />
        </G>
      ))}
      <Circle cx={cx} cy={cy} r={44} fill="#B08A4F" fillOpacity={0.35} />
      {stamens.map((a) => (
        <G key={`s${a}`} transform={turn(a)}>
          <Line x1={cx} y1={cy - 16} x2={cx} y2={cy - 50} stroke="#B08A4F" strokeWidth={2} />
          <Circle cx={cx} cy={cy - 55} r={6} fill="#D2AE6B" stroke="#8F6F3A" strokeWidth={1} />
        </G>
      ))}
      <Circle cx={cx} cy={cy} r={22} fill="#B08A4F" stroke="#8F6F3A" strokeWidth={1.4} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <G key={`c${a}`} transform={turn(a)}>
          <Circle cx={cx} cy={cy - 11} r={3.4} fill="#E9CF96" />
        </G>
      ))}
    </Svg>
  )
}

/** A thin gold rule with a small diamond in the middle: the mark that sets a heading apart. */
export function Ornament({ width = 120, align = 'flex-start', tone = colors.sun }: { width?: number; align?: 'flex-start' | 'center'; tone?: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: align }}>
      <View style={{ flex: 1, height: 1, backgroundColor: tone }} />
      <View style={{ width: 7, height: 7, backgroundColor: tone, transform: [{ rotate: '45deg' }] }} />
      <View style={{ flex: 1, height: 1, backgroundColor: tone }} />
    </View>
  )
}
