import { View } from 'react-native'
import { Badge } from './Controls'
import { Icon } from './Icon'
import { Card } from './Surfaces'
import { Text } from './Text'
import type { CommunityEvent } from '@/api/types'
import { now } from '@/lib/clock'
import { isHappeningNow, kindLabel } from '@/lib/events'
import { whenLabel } from '@/lib/groupChat'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

/** One event in a list: what it is, when, where, and how many are interested. */
export function EventCard({ event }: { event: CommunityEvent }) {
  const t = now()
  return (
    <Card testID={`event-${event.id}`} onPress={() => go(`/events/${event.id}`)} accessibilityLabel={`${event.title}, ${whenLabel(event.startsAt, t)}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Badge label={kindLabel(event.kind)} tone="plain" />
        <Badge label={event.mode === 'online' ? 'Online' : 'In person'} tone="plain" />
        {isHappeningNow(event, t) ? <Badge tone="sun" label="Happening now" /> : null}
      </View>
      <Text variant="h3" style={{ marginTop: 10 }}>
        {event.title}
      </Text>
      <Text variant="small" style={{ marginTop: 4 }} color={colors.mossDeep} bold>
        {whenLabel(event.startsAt, t)}
      </Text>
      <Text variant="small" muted numberOfLines={2} style={{ marginTop: 4 }}>
        {event.blurb}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <Icon name="heart" size={16} color={event.interestedByMe ? colors.moss : colors.muted} />
        <Text variant="caption" muted>
          {event.interested} interested
        </Text>
        <View style={{ flex: 1 }} />
        <Text variant="caption" muted>
          with {event.host}
        </Text>
      </View>
    </Card>
  )
}
