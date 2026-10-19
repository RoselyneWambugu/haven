import { useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Segmented } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { goBack } from '@/lib/nav'
import { useDb } from '@/store/db'

type Outcome = 'upheld' | 'reduced' | 'overturned'

/** Appeal review (ADM-10): the member's own words come first, and the original decision-maker can't be the reviewer. */
export default function AppealReview() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const a = useDb((s) => s.admin)
  useDb((s) => s.account)
  const [outcome, setOutcome] = useState<Outcome>('upheld')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!a) return null
  const ap = api.admin.appeals().find((x) => x.id === id)
  if (!ap) return null
  const conflict = ap.decidedBy === a.staffName

  return (
    <PortalPage testID="admin-appeal" title={`Appeal ${ap.id.length > 10 ? '(member)' : ap.id}`} sub={`${ap.penName} · SLA ${ap.slaHours} h`}>
      <Panel title="Original decision">
        <Text variant="small">{ap.decision}</Text>
        <Text variant="caption" muted>
          Decided by {ap.decidedBy}
        </Text>
      </Panel>
      <Panel title="Member’s statement" tone="lichen">
        <Text variant="body" italic>
          “{ap.statement || 'No statement.'}”
        </Text>
      </Panel>
      {conflict ? (
        <Banner tone="sun" icon="shield" title="You made the original decision">
          An appeal must be reviewed by someone else. Sign in as another reviewer to decide it.
        </Banner>
      ) : null}
      {ap.status !== 'open' ? (
        <Banner tone="green" icon="check">
          Decided: {ap.status}
        </Banner>
      ) : (
        <Panel title="Outcome">
          <Segmented value={outcome} onChange={setOutcome} options={[{ value: 'upheld', label: 'Uphold' }, { value: 'reduced', label: 'Reduce' }, { value: 'overturned', label: 'Overturn and restore' }]} />
          <Field testID="appeal-explanation" label="Explanation to the member" value={text} onChangeText={(v) => { setText(v); setError(null) }} multiline minHeight={100} error={error} />
          <Button
            testID="appeal-decide"
            label="Send decision"
            onPress={() => {
              const r = api.admin.decideAppeal(ap.id, outcome, text)
              if (!r.ok) return setError(r.error)
              goBack('/admin/appeals')
            }}
          />
        </Panel>
      )}
    </PortalPage>
  )
}
