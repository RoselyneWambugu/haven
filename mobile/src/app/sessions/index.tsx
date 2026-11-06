import { View } from 'react-native'
import { colors } from '@/theme'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Pressable } from 'react-native'
import { Icon } from '@/components/Icon'
import { toggleMuted, useMuted } from '@/store/mutedAlarms'
import { Card, EmptyState, SectionLabel } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { dayAndClock } from '@/lib/time'
import { useDb } from '@/store/db'
import type { Session } from '@/api'

const MODE = { chat: 'Chat', voice: 'Voice', video: 'Video' } as const
const STATUS: Record<Session['status'], string> = { booked: 'Booked', completed: 'Done', cancelled: 'Cancelled', missed: 'Missed' }

export default function Sessions() {
  const sessions = useDb((s) => s.sessions)
  const upcoming = sessions.filter((s) => s.status === 'booked' && s.end > now()).sort((a, b) => a.start - b.start)
  const muted = useMuted()
  const past = sessions.filter((s) => !upcoming.includes(s)).sort((a, b) => b.start - a.start)
  const card = (s: Session) => {
    const t = THERAPISTS.find((x) => x.id === s.therapistId)
    const upcomingOne = s.status === 'booked' && s.end > now()
    const off = muted.includes(`s:${s.id}`)
    return (
      <Card key={s.id} testID={`session-${s.id}`} onPress={() => go(`/sessions/${s.id}`)} accessibilityLabel={`${t?.name}, ${dayAndClock(s.start)}`}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="h3">{t?.name}</Text>
            <Text variant="small">{dayAndClock(s.start)}</Text>
            {upcomingOne ? (
              <Text variant="caption" muted>
                {off ? 'Reminders are off' : 'We’ll remind you an hour and 10 minutes before'}
              </Text>
            ) : null}
          </View>
          {upcomingOne ? (
            <Pressable
              testID={`bell-${s.id}`}
              accessibilityRole="switch"
              accessibilityState={{ checked: !off }}
              accessibilityLabel={off ? 'Turn reminders on for this session' : 'Turn reminders off for this session'}
              onPress={() => toggleMuted(`s:${s.id}`)}
              hitSlop={8}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: off ? 'transparent' : colors.fern, borderWidth: 1.5, borderColor: off ? colors.line : colors.sun }}
            >
              <Icon name="bell" size={20} color={off ? colors.muted : colors.sun} />
            </Pressable>
          ) : null}
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            <Badge label={MODE[s.mode]} tone="plain" />
            {s.status !== 'booked' ? <Badge label={STATUS[s.status]} tone={s.status === 'completed' ? 'green' : 'plain'} /> : null}
          </View>
        </View>
      </Card>
    )
  }
  return (
    <Screen testID="sessions" header={<TopBar back />}>
      <Text variant="title">My sessions</Text>
      {upcoming.length ? (
        <>
          <SectionLabel>Upcoming</SectionLabel>
          {upcoming.map(card)}
        </>
      ) : (
        <EmptyState icon="cal" title="No upcoming sessions" body="Book a time with a licensed therapist.">
          <Button label="Find a therapist" onPress={() => go('/therapists')} />
        </EmptyState>
      )}
      {past.length ? (
        <>
          <SectionLabel>Past</SectionLabel>
          {past.map(card)}
        </>
      ) : null}
    </Screen>
  )
}
