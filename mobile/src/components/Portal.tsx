import { ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { colors } from '@/theme'
import { Text } from './Text'

/** True on a desktop-sized window. The portal lays out in two columns there and stacks on narrow ones. */
export function useWide(): boolean {
  return useWindowDimensions().width >= 900
}

/** A page in the portal: a title, a short line under it, and content with comfortable margins. */
export function PortalPage({ title, sub, actions, children, testID, gap = 18 }: { title: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode; testID?: string; gap?: number }) {
  return (
    <ScrollView testID={testID} contentContainerStyle={{ padding: 24, paddingBottom: 56, gap }} style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Text variant="title">{title}</Text>
          {sub ? (
            <Text variant="small" muted>
              {sub}
            </Text>
          ) : null}
        </View>
        {actions}
      </View>
      {children}
    </ScrollView>
  )
}

/** A white panel with an optional heading. */
export function Panel({ title, children, style, tone = 'milk', testID }: { title?: string; children: React.ReactNode; style?: ViewStyle; tone?: 'milk' | 'lichen' | 'sun'; testID?: string }) {
  const bg = { milk: colors.milk, lichen: colors.lichen, sun: colors.sunSoft }[tone]
  return (
    <View testID={testID} style={[{ backgroundColor: bg, borderRadius: 20, padding: 18, gap: 12, borderWidth: tone === 'milk' ? 1 : 0, borderColor: colors.line }, style]}>
      {title ? <Text variant="h3">{title}</Text> : null}
      {children}
    </View>
  )
}

/** A big number with a small label. Nothing here ranks therapists against each other (THR-15). */
export function Stat({ value, label, tone }: { value: string; label: string; tone?: 'sun' }) {
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: tone === 'sun' ? colors.sunSoft : colors.milk, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="title">{value}</Text>
      <Text variant="small" muted>
        {label}
      </Text>
    </View>
  )
}
