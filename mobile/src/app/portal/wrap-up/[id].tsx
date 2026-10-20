import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api, type Attendance } from '@/api'
import { Button } from '@/components/Button'
import { Check, Segmented } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { go, resetTo } from '@/lib/nav'
import { dayAndClock } from '@/lib/time'
import { useDb } from '@/store/db'

/** Wrap-up (THR-19): attendance feeds billing and no-show rules, the note stays private, and a follow-up goes to the client as a booking offer. */
export default function WrapUp() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const s = useDb((st) => st.portal?.sessions.find((x) => x.id === id))
  const [attendance, setAttendance] = useState<Attendance>('attended')
  const [note, setNote] = useState(s?.note ?? '')
  const [follow, setFollow] = useState(true)
  if (!s) return null
  const suggested = Math.max(now(), s.start) + 7 * 24 * 3600_000

  return (
    <View testID="wrap-up" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 560, gap: 14 }}>
        <Text variant="title">Wrap up session</Text>
        <Text variant="small" muted>
          {s.clientName} · {dayAndClock(s.start)}
        </Text>
        <Text variant="label">Attendance</Text>
        <Segmented value={attendance} onChange={setAttendance} options={[{ value: 'attended', label: 'Attended' }, { value: 'late', label: 'Late' }, { value: 'no-show', label: 'No-show' }]} />
        <Field testID="wrap-note" label="Private session note (autosaved)" value={note} onChangeText={setNote} multiline minHeight={150} hint="Only you can see this. Notes are stored encrypted." />
        <Check testID="wrap-follow" checked={follow} label={`Suggest a follow-up on ${dayAndClock(suggested)}`} onPress={() => setFollow((v) => !v)} />
        <Panel tone="lichen">
          <Text variant="caption">Attendance feeds billing and the no-show rules. A no-show isn’t paid until the late-change rule is applied.</Text>
        </Panel>
        <Button
          testID="wrap-save"
          label="Save and close"
          onPress={() => {
            api.portal.wrapUp(s.id, { attendance, note, followUp: follow ? suggested : null })
            resetTo('/portal/sessions')
          }}
        />
        <Button variant="ghost" icon="flag" label="I have a concern to flag" onPress={() => go(`/portal/concern?session=${s.id}`)} />
      </View>
    </View>
  )
}
