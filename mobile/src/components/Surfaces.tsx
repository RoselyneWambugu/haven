import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { colors, radius } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export function Card({ children, style, tone = 'milk', onPress, accessibilityLabel, testID }: { children: React.ReactNode; style?: ViewStyle; tone?: 'milk' | 'lichen' | 'sun' | 'fern' | 'clay' | 'plain'; onPress?: () => void; accessibilityLabel?: string; testID?: string }) {
  const bg = { milk: colors.milk, lichen: colors.lichen, sun: colors.sunSoft, fern: colors.fern, clay: colors.claySoft, plain: colors.paper }[tone]
  const border = tone === 'milk' || tone === 'plain' ? { borderWidth: 1, borderColor: colors.line } : null
  const s = [styles.card, { backgroundColor: bg }, border, style]
  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [...s, { opacity: pressed ? 0.9 : 1 }]}>
        {children}
      </Pressable>
    )
  }
  return (
    <View testID={testID} style={s} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  )
}

/** A short, calm message. Sun for "this needs your attention", green for reassurance, clay for something serious. */
export function Banner({ tone = 'green', title, children, icon, testID }: { tone?: 'green' | 'sun' | 'clay'; title?: string; children?: React.ReactNode; icon?: IconName; testID?: string }) {
  const bg = { green: colors.lichen, sun: colors.sunSoft, clay: colors.claySoft }[tone]
  const fg = { green: colors.mossDeep, sun: colors.sunInk, clay: colors.clay }[tone]
  return (
    <View testID={testID} style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="summary">
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="label" color={fg}>
            {title}
          </Text>
        ) : null}
        {children ? (
          <Text variant="small" color={tone === 'green' ? colors.mossDeep : tone === 'clay' ? '#7A2C1C' : '#4F3A1A'}>
            {children}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="label" muted style={{ marginTop: 6 }} accessibilityRole="header">
      {children}
    </Text>
  )
}

/** A tappable settings or list row: title, optional subtitle, optional right side. */
export function Row({ title, sub, onPress, right, icon, danger, testID, last }: { title: string; sub?: string; onPress?: () => void; right?: React.ReactNode; icon?: IconName; danger?: boolean; testID?: string; last?: boolean }) {
  const inner = (
    <View style={[styles.row, last ? null : { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
      {icon ? <Icon name={icon} size={20} color={danger ? colors.clay : colors.mossDeep} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="body" color={danger ? colors.clay : colors.ink}>
          {title}
        </Text>
        {sub ? (
          <Text variant="small" muted>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={18} color={colors.muted} /> : null)}
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {inner}
    </Pressable>
  )
}

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 12 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={colors.mossDeep} />
      </View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      <Text variant="small" muted align="center" style={{ maxWidth: 280 }}>
        {body}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 16 },
  banner: { flexDirection: 'row', gap: 10, borderRadius: radius.md, padding: 14, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 },
})
