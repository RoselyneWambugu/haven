import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '@/i18n'
import { go, goBack } from '@/lib/nav'
import { unreadCount } from '@/lib/notifications'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors, DOCK_SPACE, MAX_WIDTH } from '@/theme'
import { Avatar, LogoMark } from './Art'
import { Count, Pill } from './Controls'
import { Icon } from './Icon'
import { Text } from './Text'

// ---------------------------------------------------------------------------
// TopBar: back or avatar on the left, urgent help on the right. Urgent help is on
// every screen, signed in or not, and never needs a login (PRD ACC-22, CRS-1).
// ---------------------------------------------------------------------------

/** The notification bell, with a count of new notes. */
function Bell() {
  const notes = useDb((s) => s.notifications)
  const n = unreadCount(notes, useNow())
  return (
    <Pressable testID="open-notifications" accessibilityRole="button" accessibilityLabel={n ? `Notifications, ${n} new` : 'Notifications'} onPress={() => go('/notifications')} hitSlop={8} style={styles.iconBtn}>
      <Icon name="bell" size={22} color={colors.ink} />
      {n ? (
        <View style={{ position: 'absolute', top: 4, right: 2 }}>
          <Count n={n} />
        </View>
      ) : null}
    </Pressable>
  )
}

export function TopBar({
  title, back, avatar, logo, urgent = true, dark, right, onBack,
}: {
  title?: string
  back?: boolean
  avatar?: boolean
  logo?: boolean
  urgent?: boolean
  dark?: boolean
  right?: React.ReactNode
  onBack?: () => void
}) {
  const t = useT()
  const kind = useDb((s) => s.account?.public.avatar)
  const fg = dark ? colors.paper : colors.ink
  return (
    <View style={styles.top}>
      <View style={styles.topLeft}>
        {back ? (
          <Pressable testID="back" accessibilityRole="button" accessibilityLabel={t('Back')} onPress={onBack ?? (() => goBack())} hitSlop={8} style={styles.iconBtn}>
            <Icon name="back" size={24} color={fg} />
          </Pressable>
        ) : null}
        {avatar && kind ? (
          <Pressable testID="open-me" accessibilityRole="button" accessibilityLabel="Me, your profile and settings" onPress={() => go('/me')} hitSlop={8}>
            <Avatar kind={kind} size={38} />
          </Pressable>
        ) : null}
        {logo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LogoMark size={40} />
            <Text variant="h2" color={fg}>
              echo
            </Text>
          </View>
        ) : null}
        {title ? (
          <Text variant="label" color={dark ? colors.lichen : colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.topRight}>
        {right}
        {avatar ? <Bell /> : null}
        {urgent ? <Pill label={t('Urgent help')} onPress={() => go('/urgent')} /> : null}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen: safe areas, scrolling, an optional sticky footer, and room for the tab bar.
// ---------------------------------------------------------------------------

export function Screen({
  children, header, footer, scroll = true, tab, dark, padded = true, gap = 14, testID, keyboard,
}: {
  children?: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  scroll?: boolean
  tab?: boolean
  dark?: boolean
  padded?: boolean
  gap?: number
  testID?: string
  keyboard?: boolean
}) {
  const insets = useSafeAreaInsets()
  const bg = dark ? colors.fern : colors.paper
  const body = (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: padded ? 18 : 0 }}>{header}</View>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: padded ? 18 : 0, paddingTop: 6, paddingBottom: tab ? DOCK_SPACE + insets.bottom : footer ? 12 : insets.bottom + 24, gap }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: padded ? 18 : 0, paddingTop: 6, paddingBottom: tab ? DOCK_SPACE + insets.bottom : footer ? 12 : insets.bottom + 16, gap }}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: dark ? colors.fern : colors.paper }]}>{footer}</View> : null}
    </View>
  )
  const content = keyboard ? (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  )
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: bg }}>
      {content}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Tab bar: a floating dock, with the active tab in a soft pill.
// ---------------------------------------------------------------------------

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] }
  /** Newer navigation versions pass this. */
  navigateToTab?: (routeKey: string) => void
  /** Older ones (Expo SDK 57) pass the navigation helpers instead. */
  navigation?: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }
    navigate: (name: string) => void
  }
}

const TABS: Record<string, { label: string; icon: 'home' | 'chats' | 'forum' | 'heart' | 'help' }> = {
  home: { label: 'Home', icon: 'home' },
  chats: { label: 'Chats', icon: 'chats' },
  forum: { label: 'Community', icon: 'forum' },
  therapists: { label: 'Therapists', icon: 'heart' },
  help: { label: 'Help', icon: 'help' },
}

export function TabBar({ state, navigateToTab, navigation }: TabBarProps) {
  const pressTab = (r: { key: string; name: string }) => {
    if (navigateToTab) return navigateToTab(r.key)
    const e = navigation?.emit({ type: 'tabPress', target: r.key, canPreventDefault: true })
    if (!e?.defaultPrevented) navigation?.navigate(r.name)
  }
  const t = useT()
  const insets = useSafeAreaInsets()
  const unreadChats = useDb((s) => s.conversations.reduce((n, c) => n + (c.archived ? 0 : c.unread), 0))
  const unreadHelp = useDb((s) => s.tickets.filter((x) => x.unread).length)
  const sub = useDb((s) => s.sessions.filter((x) => x.status === 'booked').length)
  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.dock} accessibilityRole="tablist">
        {state.routes.map((r, i) => {
          const meta = TABS[r.name]
          if (!meta) return null
          const on = state.index === i
          const badge = r.name === 'chats' ? unreadChats : r.name === 'help' ? unreadHelp : r.name === 'therapists' ? 0 : 0
          const label = t(meta.label)
          return (
            <Pressable
              key={r.key}
              testID={`tab-${r.name}`}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on }}
              onPress={() => pressTab(r)}
              style={styles.tab}
            >
              <View style={[styles.iconPill, on ? { backgroundColor: colors.lichen } : null]}>
                <Icon name={meta.icon} size={22} color={on ? colors.mossDeep : colors.muted} />
                {badge > 0 ? <View style={styles.badge} /> : null}
                {r.name === 'therapists' && sub > 0 && !on ? <View style={styles.badge} /> : null}
              </View>
              <Text variant="caption" bold={on} color={on ? colors.mossDeep : colors.muted} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  top: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 6 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  footer: { paddingHorizontal: 18, paddingTop: 10, gap: 10, borderTopWidth: 1, borderTopColor: colors.line },
  dockWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 14, maxWidth: MAX_WIDTH, alignSelf: 'center', width: '100%' },
  dock: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', backgroundColor: colors.milk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, shadowColor: colors.fern, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52 },
  iconPill: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999 },
  badge: { position: 'absolute', top: 2, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun },
})
