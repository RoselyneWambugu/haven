import { Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@/theme'
import { LogoMark } from './Art'
import { useWide } from './Portal'
import { Text } from './Text'

export interface NavItem {
  key: string
  label: string
  onPress: () => void
  testID?: string
  accessibilityLabel?: string
  /** A small orange dot, for something that needs attention. */
  dot?: boolean
}

/**
 * The frame for the therapist portal and the admin dashboard. On a wide window the navigation is a sidebar on the left,
 * with the person's details at its foot. On a narrow window it folds into a header with a scrolling tab row.
 * Pages without navigation (sign-in, a live session) get the header only.
 */
export function DashboardFrame({
  brand, tagline, dark, items, active, user, showNav, children,
}: {
  brand: string
  tagline?: string
  dark?: boolean
  items: NavItem[]
  active: string
  /** Who is signed in, and how to sign out. */
  user?: React.ReactNode
  showNav: boolean
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  const wide = useWide()
  const fg = dark ? colors.paper : colors.ink
  const muted = dark ? colors.lichen : colors.muted
  const bar = dark ? colors.fern : colors.milk

  const logo = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LogoMark color={dark ? colors.paper : colors.fern} />
      <View>
        <Text variant="h3" color={fg}>
          {brand}
        </Text>
        {tagline ? (
          <Text variant="caption" color={muted}>
            {tagline}
          </Text>
        ) : null}
      </View>
    </View>
  )

  if (showNav && wide) {
    return (
      <View testID="sidebar-frame" style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.paper, paddingTop: insets.top }}>
        <View testID="sidebar" accessibilityRole="tablist" style={{ width: 236, backgroundColor: bar, paddingVertical: 20, paddingHorizontal: 12, gap: 4, borderRightWidth: dark ? 0 : 1, borderRightColor: colors.line }}>
          <View style={{ paddingHorizontal: 10, paddingBottom: 18 }}>{logo}</View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={false}>
            {items.map((n) => {
              const on = active === n.key
              return (
                <Pressable
                  key={n.key}
                  testID={n.testID}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={n.accessibilityLabel ?? n.label}
                  onPress={n.onPress}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? (dark ? 'rgba(245,246,234,0.14)' : colors.lichen) : 'transparent' }}
                >
                  <Text variant="label" color={on ? (dark ? colors.white : colors.mossDeep) : muted} style={{ flex: 1 }}>
                    {n.label}
                  </Text>
                  {n.dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun }} /> : null}
                </Pressable>
              )
            })}
          </ScrollView>
          {user ? <View style={{ paddingHorizontal: 10, paddingTop: 14, gap: 8, borderTopWidth: 1, borderTopColor: dark ? 'rgba(245,246,234,0.2)' : colors.line }}>{user}</View> : null}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: bar, flexWrap: 'wrap', borderBottomWidth: dark ? 0 : 1, borderBottomColor: colors.line }}>
        {logo}
        <View style={{ flex: 1 }} />
        {user}
      </View>
      {showNav ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 4 }} accessibilityRole="tablist">
            {items.map((n) => {
              const on = active === n.key
              return (
                <Pressable key={n.key} testID={n.testID} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={n.accessibilityLabel ?? n.label} onPress={n.onPress} style={{ paddingHorizontal: 14, minHeight: 48, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: on ? colors.moss : 'transparent' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="label" color={on ? colors.mossDeep : colors.muted}>
                      {n.label}
                    </Text>
                    {n.dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun }} /> : null}
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  )
}
