import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Chip, Radio } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { groupSlotsByDay, type Mode } from '@/lib/booking'
import { now } from '@/lib/clock'
import { slotsFor } from '@/lib/directory'
import { modesFor } from '@/lib/content'
import { go } from '@/lib/nav'
import { clock, dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

const LABEL: Record<Mode, string> = { chat: 'Chat', voice: 'Voice call', video: 'Video call' }

/** Choose a session type and a time, then go to checkout. Times are Kenya time. */
export default function Book() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = THERAPISTS.find((x) => x.id === id)
  const sessions = useDb((s) => s.sessions)
  const money = useMoney()
  const flags = useDb((s) => s.content.flags)
  const offered = t ? modesFor(t.modes, flags) : []
  const [mode, setMode] = useState<Mode>(offered[0] ?? 'chat')
  const [start, setStart] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!t) return null

  const slots = slotsFor(t, sessions, now()).filter((s) => s.modes.includes(mode))
  const days = groupSlotsByDay(slots).slice(0, 7)

  function next() {
    if (start === null) return
    const r = api.billing.createCheckout({ kind: 'session', therapistId: t!.id, mode, start })
    if (!r.ok) {
      setStart(null)
      return setError(r.error)
    }
    go('/checkout')
  }

  return (
    <Screen testID="book-screen" header={<TopBar back title={t.name} />} footer={<Button testID="book-continue" label={start === null ? 'Pick a time' : `Continue · ${money(t.priceKes)}`} disabled={start === null} onPress={next} />}>
      <Text variant="title">Book a session</Text>
      <Text variant="small" muted>
        Session type
      </Text>
      {offered.map((m) => (
        <Radio key={m} testID={`mode-${m}`} selected={mode === m} label={LABEL[m]} onPress={() => { setMode(m); setStart(null) }} />
      ))}
      <Text variant="small" muted>
        Pick a time (Kenya time)
      </Text>
      {days.length ? (
        days.map(({ day, slots: list }) => (
          <View key={day} style={{ gap: 8 }}>
            <Text variant="label">{dayLong(day)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {list.map((s) => (
                <Chip key={s.id} testID={`slot-${s.start}`} label={clock(s.start)} selected={start === s.start} onPress={() => { setStart(s.start); setError(null) }} />
              ))}
            </View>
          </View>
        ))
      ) : (
        <Banner tone="sun" icon="clock">
          No {LABEL[mode].toLowerCase()} times in the next 2 weeks. Try another session type.
        </Banner>
      )}
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <Text variant="caption" color={colors.muted}>
        Free to change up to 24 hours before. After that, the session is charged.
      </Text>
    </Screen>
  )
}
