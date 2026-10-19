import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { changeOutcome, groupSlotsByDay } from '@/lib/booking'
import { now } from '@/lib/clock'
import { slotsFor } from '@/lib/directory'
import { goBack } from '@/lib/nav'
import { clock, dayAndClock, dayLong } from '@/lib/time'
import { useDb } from '@/store/db'

/** Reschedule or cancel. Says plainly whether it is free or charged before anything happens (PRD THR-28 to THR-30). */
export default function SessionChange() {
  const { id, action } = useLocalSearchParams<{ id: string; action: 'reschedule' | 'cancel' }>()
  const sessions = useDb((st) => st.sessions)
  const s = sessions.find((x) => x.id === id)
  const t = s ? THERAPISTS.find((x) => x.id === s.therapistId) : null
  const [pick, setPick] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!s || !t) return null
  const free = changeOutcome(s.start, now()) === 'free'

  if (done) {
    return (
      <Screen testID="change-done" header={<TopBar back />} footer={<Button testID="change-ok" label="Done" onPress={() => goBack('/sessions')} />}>
        <Banner tone="green" icon="check" title={done} />
      </Screen>
    )
  }

  if (action === 'cancel') {
    return (
      <Screen
        testID="session-cancel"
        header={<TopBar back />}
        footer={
          <>
            <Button
              testID="cancel-confirm"
              variant="danger"
              label="Cancel session"
              onPress={() => {
                const r = api.sessions.cancel(s.id)
                if (!r.ok) return setError(r.error)
                setDone(r.value.outcome === 'free' ? 'Cancelled. No charge.' : 'Cancelled. The session was charged.')
              }}
            />
            <Button variant="ghost" label="Keep session" onPress={() => goBack('/sessions')} />
          </>
        }
      >
        <Text variant="title">Cancel this session?</Text>
        <Text variant="body">
          {t.name}, {dayAndClock(s.start)}
        </Text>
        <Banner tone={free ? 'green' : 'sun'} icon={free ? 'check' : 'clock'}>
          {free ? 'There’s no charge. You’re cancelling more than 24 hours before.' : 'It’s less than 24 hours before, so you’ll still be charged for this session.'}
        </Banner>
        {error ? <Banner tone="clay">{error}</Banner> : null}
      </Screen>
    )
  }

  const slots = slotsFor(t, sessions.filter((x) => x.id !== s.id), now()).filter((x) => x.modes.includes(s.mode))
  const days = groupSlotsByDay(slots).slice(0, 7)
  return (
    <Screen
      testID="session-reschedule"
      header={<TopBar back />}
      footer={
        <Button
          testID="reschedule-confirm"
          label={pick === null ? 'Pick a new time' : 'Move session'}
          disabled={pick === null}
          onPress={() => {
            const r = api.sessions.reschedule(s.id, pick!)
            if (!r.ok) return setError(r.error)
            setDone(r.value.outcome === 'free' ? 'Moved. No charge.' : 'Moved. A late change fee applies.')
          }}
        />
      }
    >
      <Text variant="title">Pick a new time</Text>
      <Banner tone={free ? 'green' : 'sun'} icon="cal">
        {free ? 'Free to change.' : 'It’s within 24 hours of the session, so moving it will be charged.'}
      </Banner>
      {days.map(({ day, slots: list }) => (
        <View key={day} style={{ gap: 8 }}>
          <Text variant="label">{dayLong(day)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {list.map((x) => (
              <Chip key={x.id} label={clock(x.start)} selected={pick === x.start} onPress={() => setPick(x.start)} />
            ))}
          </View>
        </View>
      ))}
      {error ? <Banner tone="clay">{error}</Banner> : null}
    </Screen>
  )
}
