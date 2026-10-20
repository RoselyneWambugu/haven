import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api, type ConcernType } from '@/api'
import { Button } from '@/components/Button'
import { Radio } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { goBack } from '@/lib/nav'

const TYPES: { value: ConcernType; label: string }[] = [
  { value: 'self-harm', label: 'Risk of self-harm or suicide' },
  { value: 'harm-to-others', label: 'Risk of harm to others' },
  { value: 'abuse', label: 'Abuse or exploitation' },
  { value: 'behaviour', label: 'Behaviour toward me' },
]

/**
 * Raise a concern (PRD THR-18). The first question separates immediate danger from concern, because it decides how fast
 * the on-call clinical lead responds. Identity is released only by the clinical lead under the protocol, and every access is logged.
 */
export default function Concern() {
  const { session } = useLocalSearchParams<{ session?: string }>()
  const [danger, setDanger] = useState<boolean | null>(null)
  const [type, setType] = useState<ConcernType>('self-harm')
  const [detail, setDetail] = useState('')
  const [sent, setSent] = useState<{ danger: boolean } | null>(null)

  if (sent) {
    return (
      <View testID="concern-sent" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 16 }}>
          <Banner tone="green" icon="check" title="The on-call clinical lead has been alerted">
            {sent.danger ? 'They are treating this as urgent.' : 'They will review it and respond.'}
          </Banner>
          <Panel title="While you wait">
            <Text variant="small">Stay with the client and share crisis lines. Don’t end the session abruptly.</Text>
            <Text variant="small">You never receive the client’s identity directly. The clinical lead decides under the approved protocol, and every access is logged.</Text>
          </Panel>
          <Button testID="concern-done" label="Back" onPress={() => goBack('/portal/today')} />
        </View>
      </View>
    )
  }

  return (
    <View testID="concern" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
      <View style={{ width: '100%', maxWidth: 560, gap: 14 }}>
        <Text variant="title">Raise a concern</Text>
        <Text variant="label">Is anyone in immediate danger?</Text>
        <Radio testID="danger-yes" selected={danger === true} onPress={() => setDanger(true)} label="Yes, right now" />
        <Radio testID="danger-no" selected={danger === false} onPress={() => setDanger(false)} label="No, but I’m concerned" />
        <Text variant="label">What concerns you?</Text>
        {TYPES.map((t) => (
          <Radio key={t.value} selected={type === t.value} onPress={() => setType(t.value)} label={t.label} />
        ))}
        <Field testID="concern-detail" label="Anything the clinical lead should know (optional)" value={detail} onChangeText={setDetail} multiline minHeight={100} />
        <Banner tone="sun" icon="heart" title="Meanwhile">
          Stay with the client, share crisis lines, and don’t end the session abruptly.
        </Banner>
        <Button
          testID="concern-send"
          variant="danger"
          label="Send to clinical lead"
          disabled={danger === null}
          onPress={() => {
            api.portal.raiseConcern({ sessionId: session ?? null, danger: danger === true, type, detail })
            setSent({ danger: danger === true })
          }}
        />
        <Button variant="ghost" label="Cancel" onPress={() => goBack('/portal/today')} />
      </View>
    </View>
  )
}
