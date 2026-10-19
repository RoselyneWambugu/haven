import { useEffect } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { type IconName } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { EmptyState, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { due, type NoteCategory } from '@/lib/notifications'
import { relative } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

const ICON: Record<NoteCategory, IconName> = { message: 'chats', session: 'cal', forum: 'forum', plan: 'wallet', safety: 'shield', account: 'person' }

/** Everything that would have been a push notification, newest first. Held-back notes appear when quiet hours end. */
export default function Notifications() {
  const notes = useDb((s) => s.notifications)
  const t = useNow()
  const shown = due(notes, t)
  const unread = shown.filter((n) => !n.read).length

  useEffect(() => {
    api.notify.sync()
  }, [])

  return (
    <Screen testID="notification-centre" header={<TopBar back title="Notifications" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Notifications</Text>
        {unread ? <Button testID="read-all" size="sm" variant="quiet" label="Mark all read" onPress={() => api.notify.markAllRead()} /> : null}
      </View>
      {shown.length ? (
        <View>
          {shown.map((n, i) => (
            <Row
              key={n.id}
              testID="note"
              icon={ICON[n.category]}
              title={n.title}
              sub={`${n.body} · ${relative(n.deliverAt, t)}`}
              last={i === shown.length - 1}
              onPress={() => {
                api.notify.markRead(n.id)
                go(n.href)
              }}
              right={!n.read && !n.silent ? <View accessibilityLabel="New" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sun }} /> : undefined}
            />
          ))}
        </View>
      ) : (
        <EmptyState icon="bell" title="Nothing new" body="Messages, session reminders and account notices will show up here." />
      )}
      <Button variant="ghost" label="Notification settings" onPress={() => go('/settings/notifications')} />
    </Screen>
  )
}
