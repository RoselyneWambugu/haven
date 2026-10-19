import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { colors, radius } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected ? styles.chipOn : null, { opacity: pressed ? 0.85 : 1 }]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? colors.white : colors.ink} /> : null}
      <Text variant="small" color={selected ? colors.white : colors.ink} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

export function Badge({ label, icon, tone = 'green' }: { label: string; icon?: IconName; tone?: 'green' | 'sun' | 'plain' | 'clay' }) {
  const bg = { green: colors.lichen, sun: colors.sunSoft, plain: colors.paper, clay: colors.claySoft }[tone]
  const fg = { green: colors.mossDeep, sun: colors.sunInk, plain: colors.ink, clay: colors.clay }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: bg }, tone === 'plain' ? { borderWidth: 1, borderColor: colors.line } : null]}>
      {icon ? <Icon name={icon} size={12} color={fg} stroke={2.6} /> : null}
      <Text variant="caption" bold color={fg}>
        {label}
      </Text>
    </View>
  )
}

/** The only orange in the app: something here needs your attention. */
export function Count({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <View style={styles.count} accessibilityLabel={`${n} unread`}>
      <Text variant="caption" bold color={colors.ink}>
        {n > 9 ? '9+' : n}
      </Text>
    </View>
  )
}

export function Dot() {
  return <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />
}

export function Toggle({ on, onChange, label, testID }: { on: boolean; onChange: (v: boolean) => void; label: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
      hitSlop={8}
      style={[styles.tog, { backgroundColor: on ? colors.moss : colors.lichenDeep }]}
    >
      <View style={[styles.knob, { left: on ? 21 : 3 }]} />
    </Pressable>
  )
}

/** A switch with its label beside it, and an optional second line. The whole row is the tap target. */
export function ToggleRow({ on, onChange, label, sub, testID }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; testID?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {sub ? (
          <Text variant="small" muted>
            {sub}
          </Text>
        ) : null}
      </View>
      <Toggle testID={testID} on={on} onChange={onChange} label={label} />
    </View>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on ? styles.segOn : null]}
          >
            <Text variant="label" color={colors.mossDeep}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Radio({ selected, label, sub, onPress, testID }: { selected: boolean; label: string; sub?: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={sub ? `${label}. ${sub}` : label} onPress={onPress} style={styles.radioRow}>
      <View style={[styles.radio, selected ? { borderColor: colors.moss } : null]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text variant="body">{label}</Text>
        {sub ? (
          <Text variant="small" muted>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export function Check({ checked, label, onPress, testID, children }: { checked: boolean; label: string; onPress: () => void; testID?: string; children?: React.ReactNode }) {
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress} style={styles.radioRow}>
      <View style={[styles.box, checked ? { backgroundColor: colors.moss, borderColor: colors.moss } : null]}>{checked ? <Icon name="check" size={14} color={colors.white} stroke={3} /> : null}</View>
      <View style={{ flex: 1 }}>{children ?? <Text variant="small">{label}</Text>}</View>
    </Pressable>
  )
}

export function Pill({ label, onPress, style }: { label: string; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.pill, style, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.pillDot} />
      <Text variant="small" bold color={colors.sunInk}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.sun, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun },
  tog: { width: 46, height: 28, borderRadius: 14, justifyContent: 'center' },
  knob: { position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  seg: { flexDirection: 'row', backgroundColor: colors.lichen, borderRadius: radius.pill, padding: 4 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segOn: { backgroundColor: colors.milk },
  radioRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.lichenDeep, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.moss },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.lichenDeep, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.sunSoft, paddingHorizontal: 13, minHeight: 36, borderRadius: radius.pill },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sun },
})
