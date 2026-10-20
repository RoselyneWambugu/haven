import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { goBack } from '@/lib/nav'
import { decisionLabel, MIN_STATEMENT } from '@/lib/therapistAppeal'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'

const OUTCOME = { upheld: 'The decision stands', reduced: 'The decision was reduced', overturned: 'The decision was overturned' } as const

/** Appeal a clinical decision about you. A different reviewer from the one who decided reads it. */
export default function Appeal() {
  useDb((s) => s.portal)
  useDb((s) => s.admin)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const decision = api.therapistAppeals.decision()
  const latest = api.therapistAppeals.latest()

  return (
    <PortalPage testID="portal-appeal" title="Appeal a decision" sub="A different clinical reviewer reads every appeal.">
      {decision ? (
        <Panel title={decisionLabel(decision.kind)}>
          <Text variant="small">{decision.text}</Text>
          <Text variant="caption" muted>
            {dayLong(decision.at)}
          </Text>
        </Panel>
      ) : (
        <Banner tone="green" icon="check" title="Nothing to appeal">
          There is no decision in force against you.
        </Banner>
      )}
      {latest && latest.status !== 'open' ? (
        <Banner testID="appeal-result" tone={latest.status === 'upheld' ? 'sun' : 'green'} icon="shield" title={OUTCOME[latest.status]}>
          {latest.response}
        </Banner>
      ) : null}
      {latest && latest.status === 'open' ? (
        <Banner testID="appeal-waiting" tone="green" icon="clock" title="Your appeal is with a reviewer">
          You will see the outcome here. They aim to reply within {latest.slaHours} hours.
        </Banner>
      ) : decision ? (
        <Panel title="Your side">
          <Field testID="appeal-statement" label="What would you like the reviewer to know?" value={text} onChangeText={(v) => { setText(v); setError(null) }} multiline minHeight={140} maxLength={2000} error={error} hint={`At least ${MIN_STATEMENT} characters.`} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              testID="appeal-send"
              label="Send appeal"
              onPress={() => {
                const r = api.therapistAppeals.submit(text)
                if (!r.ok) return setError(r.error)
                setText('')
              }}
            />
            <Button variant="ghost" label="Back" onPress={() => goBack('/portal/today')} />
          </View>
        </Panel>
      ) : null}
    </PortalPage>
  )
}
