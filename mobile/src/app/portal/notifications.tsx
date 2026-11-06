import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Panel, PortalPage } from '@/components/Portal'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { relative } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/** What has happened to a therapist's things: for now, the decision on an event they proposed. Opening the page marks them read. */
export default function PortalNotifications() {
  const notes = useDb((s) => s.portalNotes)
  const unread = notes.filter((n) => !n.read).length

  useEffect(() => {
    // Leave them unread for a moment so the page can show which are new.
    const id = setTimeout(() => api.events.markNotesRead(), 1500)
    return () => clearTimeout(id)
  }, [])

  return (
    <PortalPage testID="portal-notifications" title="Notifications" sub={unread ? `${unread} new` : 'You’re up to date.'}>
      <Panel style={{ gap: 0 }}>
        {notes.length ? (
          notes.map((n) => (
            <Pressable key={n.id} testID={`pnote-${n.id}`} accessibilityRole="button" accessibilityLabel={n.title} onPress={() => go(n.href)} style={{ paddingVertical: 12, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!n.read ? <View accessibilityLabel="New" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sun }} /> : null}
                <Text variant="label" style={{ flex: 1 }}>
                  {n.title}
                </Text>
                <Text variant="caption" muted>
                  {relative(n.at, now())}
                </Text>
              </View>
              <Text variant="small" muted>
                {n.body}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text variant="small" muted>
            Nothing yet. When a reviewer decides on an event you proposed, you will see it here.
          </Text>
        )}
      </Panel>
    </PortalPage>
  )
}
