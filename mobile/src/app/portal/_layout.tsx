import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import { router, Slot, useSegments } from 'expo-router'
import { api } from '@/api'
import { Badge } from '@/components/Controls'
import { DashboardFrame, type NavItem } from '@/components/Frame'
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
  { key: 'groups', label: 'Group chats', path: '/portal/groups' },
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
  const items: NavItem[] = NAV.map((n) => ({
    key: n.key, label: n.label, testID: `nav-${n.key}`, dot: n.key === 'inbox' && unread > 0,
    accessibilityLabel: n.key === 'inbox' && unread ? `Inbox, ${unread} unread` : n.label, onPress: () => router.push(n.path as never),
  }))
  const active = page === 'wrap-up' ? 'sessions' : page
  const user =
    signedIn && th ? (
      <View style={{ gap: 8 }}>
        <Badge icon="check" label="Verified" />
        <Text variant="small" bold>
          {th.name}
        </Text>
        <Pressable testID="portal-sign-out" accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => { api.portal.signOut(); router.replace('/portal/sign-in' as never) }} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            Sign out
          </Text>
        </Pressable>
      </View>
    ) : null

  return (
    <DashboardFrame brand="echo" tagline="Therapist portal" items={items} active={active} user={user} showNav={!bare}>
      <Slot />
    </DashboardFrame>
  )
}
