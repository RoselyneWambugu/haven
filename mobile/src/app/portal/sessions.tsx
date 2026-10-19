import { View } from 'react-native'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Panel, PortalPage } from '@/components/Portal'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { dayAndClock } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'

/** A stable empty list, so a selector that falls back to it doesn't look like a change on every render. */
const NONE: never[] = []

const MODE = { chat: 'Chat', voice: 'Voice', video: 'Video' } as const
const ATT = { attended: 'Attended', late: 'Late', 'no-show': 'No-show' } as const

export default function Sessions() {
  const t = useNow()
  const sessions = useDb((s) => s.portal?.sessions ?? NONE)
  const upcoming = sessions.filter((s) => s.status !== 'completed').sort((a, b) => a.start - b.start)
  const past = sessions.filter((s) => s.status === 'completed').sort((a, b) => b.start - a.start)
  return (
    <PortalPage testID="portal-sessions" title="Sessions" sub={`${upcoming.length} coming up, ${past.length} done`}>
      <Panel title="Coming up">
        {upcoming.length ? (
          upcoming.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Avatar kind={s.clientAvatar} size={34} ring={false} />
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text variant="label">{s.clientName}</Text>
                <Text variant="caption" muted>
                  {dayAndClock(s.start)} · {MODE[s.mode]}
                </Text>
              </View>
              {s.status === 'in-progress' ? <Button size="sm" label="Rejoin" onPress={() => go(`/portal/session/${s.id}`)} /> : s.start - t < 10 * 60_000 ? <Button size="sm" label="Join" onPress={() => go(`/portal/session/${s.id}`)} /> : null}
            </View>
          ))
        ) : (
          <Text variant="small" muted>
            Nothing booked yet.
          </Text>
        )}
      </Panel>
      <Panel title="Done">
        {past.map((s) => (
          <View key={s.id} testID={`past-${s.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Avatar kind={s.clientAvatar} size={34} ring={false} />
            <View style={{ flex: 1, minWidth: 140 }}>
              <Text variant="label">{s.clientName}</Text>
              <Text variant="caption" muted>
                {dayAndClock(s.start)} · {MODE[s.mode]}
              </Text>
            </View>
            {s.attendance ? <Badge tone={s.attendance === 'no-show' ? 'sun' : 'green'} label={ATT[s.attendance]} /> : null}
          </View>
        ))}
      </Panel>
    </PortalPage>
  )
}
