import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ToggleRow } from '@/components/Controls'
import { THERAPISTS } from '@/data/seed'
import type { GroupChat } from '@/api/types'
import { seatsLeft, status, whenLabel } from '@/lib/groupChat'
import { go } from '@/lib/nav'
import { toggleMuted, useMuted } from '@/store/mutedAlarms'
import { toggleStartAlert, useStartAlerts } from '@/store/startAlerts'

/** The group chats the member has signed up for that have not opened yet, soonest first. Gives their details and the reminder choices. */
export function signedUpUpcoming(groups: GroupChat[], now: number): GroupChat[] {
  return groups.filter((g) => g.registered && !g.cancelled && status(g, now) === 'upcoming').sort((a, b) => a.startsAt - b.startsAt)
}

export function MyGroupChats({ groups, now }: { groups: GroupChat[]; now: number }) {
  const muted = useMuted()
  const startAlerts = useStartAlerts()
  const mine = signedUpUpcoming(groups, now)
  if (!mine.length) return null
  return (
    <View testID="my-groups">
      {mine.map((g) => {
        const th = THERAPISTS.find((t) => t.id === g.facilitatorId)
        const key = `g:${g.id}`
        return (
          <Card key={g.id} testID={`my-group-${g.id}`} style={{ marginBottom: 10, gap: 6 }}>
            <Text variant="h3">{g.topic}</Text>
            <Text variant="small">{g.blurb}</Text>
            <Text variant="small" muted>
              {whenLabel(g.startsAt, now)} · {g.durationMin} min
            </Text>
            <Text variant="small" muted>
              {th ? `Led by ${th.name}, ${th.title}` : 'Led by a verified therapist'} · {g.capacity - seatsLeft(g)} of {g.capacity} places taken
            </Text>
            <ToggleRow testID={`remind-before-${g.id}`} on={!muted.includes(key)} onChange={() => toggleMuted(key)} label="Remind me before it starts" sub="An hour before and ten minutes before" />
            <ToggleRow testID={`remind-start-${g.id}`} on={startAlerts.includes(key)} onChange={() => toggleStartAlert(key)} label="Alert me when it begins" sub="An alarm at the start time, so you don’t miss the opening" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button testID={`my-group-open-${g.id}`} size="sm" variant="quiet" label="Details" onPress={() => go(`/group-chats/${g.id}`)} />
            </View>
          </Card>
        )
      })}
    </View>
  )
}
