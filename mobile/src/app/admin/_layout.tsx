import { useEffect } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { router, Slot, useSegments } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/api'
import { LogoMark } from '@/components/Art'
import { Badge } from '@/components/Controls'
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
  const insets = useSafeAreaInsets()
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.fern, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LogoMark color={colors.paper} />
          <Text variant="h3" color={colors.paper}>
            echo admin
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {signedIn ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Badge icon="check" label="MFA" />
            <View testID="role-badge" style={{ backgroundColor: colors.lichen, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text variant="small" bold color={colors.mossDeep}>
                {ROLE_LABEL[role]}
              </Text>
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
        ) : null}
      </View>
      {signedIn ? (
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 4 }} accessibilityRole="tablist">
            {MODULES.filter((m) => canAccess(role, m.key)).map((m) => {
              const on = section === m.key
              return (
                <Pressable key={m.key} testID={`anav-${m.key}`} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => router.push(`/admin/${m.key}` as never)} style={{ paddingHorizontal: 14, minHeight: 48, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: on ? colors.moss : 'transparent' }}>
                  <Text variant="label" color={on ? colors.mossDeep : colors.muted}>
                    {m.label}
                  </Text>
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
