import { useState } from 'react'
import { View } from 'react-native'
import { api, type GroupChat } from '@/api'
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

/** Change a room that has not opened yet: its words, its time, its length and its places. Anyone signed up keeps their place and sees the new time. */
export function EditGroup({ group, onDone }: { group: GroupChat; onDone: () => void }) {
  const [topic, setTopic] = useState(group.topic)
  const [blurb, setBlurb] = useState(group.blurb)
  const [day, setDay] = useState(() => Math.max(0, Math.round((startOfEatDay(group.startsAt) - startOfEatDay(now())) / DAY)))
  const [hour, setHour] = useState(() => eat(group.startsAt).hour)
  const [mins, setMins] = useState(group.durationMin)
  const [seats, setSeats] = useState(group.capacity)
  const [error, setError] = useState<string | null>(null)
  const startsAt = startOfEatDay(now()) + day * DAY + hour * HOUR

  async function save() {
    const r = await api.groups.edit(group.id, { topic, blurb, facilitatorId: group.facilitatorId, startsAt, durationMin: mins, capacity: seats })
    if (!r.ok) return setError(r.error)
    onDone()
  }

  return (
    <Panel title="Edit this group chat" testID={`edit-${group.id}`} tone="lichen">
      <Field testID="e-topic" label="Topic" value={topic} onChangeText={(v) => { setTopic(v); setError(null) }} maxLength={LIMITS.maxTopic} />
      <Field testID="e-blurb" label="What it is about" value={blurb} onChangeText={(v) => { setBlurb(v); setError(null) }} multiline minHeight={80} maxLength={LIMITS.maxBlurb} />
      <Text variant="small" muted>Day</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) => (
          <Chip key={d} label={whenLabel(startOfEatDay(now()) + d * DAY, now()).split(',')[0]} selected={day === d} onPress={() => setDay(d)} />
        ))}
      </View>
      <Text variant="small" muted>Start (East Africa Time)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {HOURS.map((h) => (
          <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} selected={hour === h} onPress={() => setHour(h)} />
        ))}
      </View>
      <Text variant="small" muted>Length</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DURATIONS.map((m) => (
          <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMins(m)} />
        ))}
      </View>
      <Stepper label="Places" value={seats} min={LIMITS.minCapacity} max={LIMITS.maxCapacity} onChange={setSeats} />
      <Text variant="caption" muted>New time: {whenLabel(startsAt, now())} EAT</Text>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button testID="e-save" size="sm" label="Save changes" onPress={save} />
        <Button size="sm" variant="ghost" label="Close" onPress={onDone} />
      </View>
    </Panel>
  )
}
