import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import { router, Slot, useSegments } from 'expo-router'
import { api } from '@/api'
import { REMOTE } from '@/backend/client'
import { Banner } from '@/components/Surfaces'
import { Badge } from '@/components/Controls'
import { DashboardFrame, type NavItem } from '@/components/Frame'
import { Text } from '@/components/Text'
import { canAccess, MODULES, ROLE_LABEL } from '@/lib/admin'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

const KEY_OF: Record<string, string> = { case: 'cases', user: 'users', appeal: 'appeals', therapist: 'therapists', ticket: 'resources' }

/**
 * The admin dashboard frame (PRD §6.11): an internal desktop web app with MFA, role-based modules and a role badge
 * at the top right. Each role sees only its own modules, and the sign-in page is the only page open without signing in.
 */
export default function AdminLayout() {
  const segs = useSegments() as string[]
  const page = segs[1] ?? ''
  const signedIn = useDb((s) => s.admin?.signedIn ?? false)
  const role = useDb((s) => s.admin?.role ?? 'moderator')
  const name = useDb((s) => s.admin?.staffName ?? '')
  const reportCount = useDb((s) => s.reports.length)
  const section = KEY_OF[page] ?? page

  useEffect(() => {
    if (!signedIn && page !== 'sign-in') router.replace('/admin/sign-in' as never)
    if (signedIn && (page === '' || page === 'sign-in')) router.replace('/admin/overview' as never)
    if (signedIn && page && page !== 'sign-in' && !MODULES.some((m) => m.key === section)) return
    if (signedIn && MODULES.some((m) => m.key === section) && !canAccess(role, section as never)) router.replace('/admin/overview' as never)
  }, [signedIn, page, role, section])
  useEffect(() => {
    if (signedIn) api.admin.syncReports()
  }, [signedIn, reportCount])

  const items: NavItem[] = MODULES.filter((m) => canAccess(role, m.key)).map((m) => ({ key: m.key, label: m.label, testID: `anav-${m.key}`, onPress: () => router.push(`/admin/${m.key}` as never) }))
  const user = signedIn ? (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge icon="check" label="MFA" />
        <View testID="role-badge" style={{ backgroundColor: colors.lichen, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text variant="small" bold color={colors.mossDeep}>
            {ROLE_LABEL[role]}
          </Text>
        </View>
      </View>
      <Text variant="small" color={colors.paper}>
        {name}
      </Text>
      <Pressable testID="admin-sign-out" accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => { api.admin.signOut(); router.replace('/admin/sign-in' as never) }} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Text variant="small" color={colors.lichen} style={{ textDecorationLine: 'underline' }}>
          Sign out
        </Text>
      </Pressable>
    </View>
  ) : null

  return (
    <DashboardFrame brand="echo admin" dark items={items} active={section} user={user} showNav={signedIn}>
      {REMOTE && signedIn ? (
        <View style={{ paddingBottom: 12 }}>
          <Banner tone="sun" icon="lock">
            Live: cases, users, appeals, therapists, held posts and the audit log. Other modules still show sample data.
          </Banner>
        </View>
      ) : null}
      <Slot />
    </DashboardFrame>
  )
}
