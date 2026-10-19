import { useEffect } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router, Slot, useSegments } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/api'
import { LogoMark } from '@/components/Art'
import { Badge } from '@/components/Controls'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

const NAV: { key: string; label: string; path: string }[] = [
  { key: 'today', label: 'Today', path: '/portal/today' },
  { key: 'inbox', label: 'Inbox', path: '/portal/inbox' },
  { key: 'calendar', label: 'Calendar', path: '/portal/calendar' },
  { key: 'sessions', label: 'Sessions', path: '/portal/sessions' },
  { key: 'forum', label: 'Forum', path: '/portal/forum' },
  { key: 'earnings', label: 'Earnings', path: '/portal/earnings' },
  { key: 'profile', label: 'Profile', path: '/portal/profile' },
  { key: 'help', label: 'Help', path: '/portal/help' },
]
const PUBLIC = new Set(['sign-in', 'apply'])

/**
 * The therapist portal frame: a top bar with the main sections. Therapists work with notes, calendars and calls,
 * so this is drawn as a desktop web app (PRD THR-14, D23). Sign-in and the application are the only pages open without signing in.
 */
export default function PortalLayout() {
  const segs = useSegments() as string[]
  const page = segs[1] ?? ''
  const insets = useSafeAreaInsets()
  const signedIn = useDb((s) => s.portal?.signedIn ?? false)
  const therapistId = useDb((s) => s.portal?.therapistId)
  const unread = useDb((s) => s.portal?.threads.reduce((n, t) => n + t.unread, 0) ?? 0)
  const th = THERAPISTS.find((t) => t.id === therapistId)

  useEffect(() => {
    if (!signedIn && !PUBLIC.has(page)) router.replace('/portal/sign-in' as never)
    if (signedIn && page === '') router.replace('/portal/today' as never)
  }, [signedIn, page])

  // Session screens take the whole window, so the live call is not crowded by navigation.
  const bare = !signedIn || page === 'session'
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.milk, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LogoMark />
          <Text variant="h3">echo</Text>
          <Text variant="small" muted>
            Therapist portal
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {signedIn && th ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge icon="check" label="Verified" />
            <Text variant="small" bold>
              {th.name}
            </Text>
            <Pressable testID="portal-sign-out" accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => { api.portal.signOut(); router.replace('/portal/sign-in' as never) }} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }}>
              <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
                Sign out
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {!bare ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 4 }} accessibilityRole="tablist">
            {NAV.map((n) => {
              const on = page === n.key || (n.key === 'sessions' && page === 'wrap-up')
              return (
                <Pressable key={n.key} testID={`nav-${n.key}`} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={n.key === 'inbox' && unread ? `Inbox, ${unread} unread` : n.label} onPress={() => router.push(n.path as never)} style={{ paddingHorizontal: 14, minHeight: 48, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: on ? colors.moss : 'transparent' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="label" color={on ? colors.mossDeep : colors.muted}>
                      {n.label}
                    </Text>
                    {n.key === 'inbox' && unread > 0 ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun }} /> : null}
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
    </View>
  )
}
