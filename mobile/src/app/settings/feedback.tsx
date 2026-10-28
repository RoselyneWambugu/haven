import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Radio, ToggleRow } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { FEEDBACK_MAX, KINDS } from '@/lib/feedback'
import { goBack } from '@/lib/nav'
import type { FeedbackKind } from '@/api'

/** Feedback and bug reports (PRD FDB-3). They are private and not tied to a conversation. */
export default function Feedback() {
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [text, setText] = useState('')
  const [withDevice, setWithDevice] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const r = await api.feedback.send(kind, text, withDevice)
    if (!r.ok) return setError(r.error)
    goBack('/settings')
  }

  return (
    <Screen testID="feedback" keyboard header={<TopBar back title="Send feedback" />}>
      <Text variant="title">Send feedback</Text>
      <Text variant="small" muted>
        Tell us what would help, or what went wrong. Please don’t include contact details or anything about another person.
      </Text>
      <View>
        {KINDS.map((k) => (
          <Radio key={k.value} testID={`fb-${k.value}`} selected={kind === k.value} label={k.label} onPress={() => setKind(k.value)} />
        ))}
      </View>
      <Field testID="fb-text" label="Your note" value={text} onChangeText={(v) => { setText(v); setError(null) }} multiline minHeight={140} maxLength={FEEDBACK_MAX} />
      <ToggleRow testID="fb-device" label="Include app details" sub="The app version and whether you use a phone or a browser. Nothing about you." on={withDevice} onChange={setWithDevice} />
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <Button testID="fb-send" label="Send" onPress={send} />
    </Screen>
  )
}
