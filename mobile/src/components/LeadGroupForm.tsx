import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, Stepper } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { LIMITS, whenLabel } from '@/lib/groupChat'
import { eat, startOfEatDay } from '@/lib/time'

const HOUR = 3600_000
const DAY = 24 * HOUR
const HOURS = [9, 10, 12, 14, 16, 18, 19, 20]
const DURATIONS = [30, 45, 60, 90]

export interface LeadRoom {
  id: string
  topic: string
  blurb: string
  startsAt: number
  durationMin: number
  capacity: number
}

/** A therapist schedules a group chat they will lead, or changes one that hasn't opened yet. */
export function LeadGroupForm({ room, onDone }: { room?: LeadRoom; onDone: (message?: string) => void }) {
  const [topic, setTopic] = useState(room?.topic ?? '')
  const [blurb, setBlurb] = useState(room?.blurb ?? '')
  const [day, setDay] = useState(() => (room ? Math.max(0, Math.round((startOfEatDay(room.startsAt) - startOfEatDay(now())) / DAY)) : 1))
  const [hour, setHour] = useState(() => (room ? eat(room.startsAt).hour : 18))
  const [mins, setMins] = useState(room?.durationMin ?? 60)
  const [seats, setSeats] = useState(room?.capacity ?? 12)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const startsAt = startOfEatDay(now()) + day * DAY + hour * HOUR

  async function save() {
    setBusy(true)
    const input = { topic, blurb, startsAt, durationMin: mins, capacity: seats }
    const r = room ? await api.groups.leadEdit(room.id, input) : await api.groups.leadSchedule(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onDone(room ? 'Saved. People signed up see the new time.' : `Scheduled for ${whenLabel(startsAt, now())}. Members can sign up now.`)
  }

  return (
    <Panel title={room ? 'Edit this group chat' : 'Schedule a group chat'} testID={room ? `lead-edit-${room.id}` : 'lead-new'} tone="lichen">
      <Field testID="lead-topic" label="Topic" placeholder="What the hour feels like, in plain words" value={topic} onChangeText={(v) => { setTopic(v); setError(null) }} maxLength={LIMITS.maxTopic} />
      <Field testID="lead-blurb" label="What it is about" placeholder="A sentence or two for members deciding whether to come" value={blurb} onChangeText={(v) => { setBlurb(v); setError(null) }} multiline minHeight={80} maxLength={LIMITS.maxBlurb} />
      <Text variant="small" muted>Day</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => (
          <Chip key={d} testID={`lead-day-${d}`} label={whenLabel(startOfEatDay(now()) + d * DAY, now()).split(',')[0]} selected={day === d} onPress={() => { setDay(d); setError(null) }} />
        ))}
      </View>
      <Text variant="small" muted>Start (East Africa Time)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {HOURS.map((h) => (
          <Chip key={h} testID={`lead-hour-${h}`} label={`${String(h).padStart(2, '0')}:00`} selected={hour === h} onPress={() => { setHour(h); setError(null) }} />
        ))}
      </View>
      <Text variant="small" muted>Length</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DURATIONS.map((m) => (
          <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMins(m)} />
        ))}
      </View>
      <Stepper label="Places" value={seats} min={LIMITS.minCapacity} max={LIMITS.maxCapacity} onChange={setSeats} />
      <Text variant="caption" muted>{whenLabel(startsAt, now())} EAT · {mins} min · {seats} places</Text>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button testID="lead-save" size="sm" label={room ? 'Save changes' : 'Schedule it'} disabled={busy} onPress={save} />
        <Button size="sm" variant="ghost" label="Close" onPress={() => onDone()} />
      </View>
    </Panel>
  )
}
