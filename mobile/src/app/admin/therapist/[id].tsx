import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Check, Segmented } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { goBack } from '@/lib/nav'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'

type Decision = 'approved' | 'info' | 'rejected'

/** Verification checklist (ADM-11): name matches ID, licence checked with the regulator, expiry, qualification. Each decision needs a message. */
export default function VerifyTherapist() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const a = useDb((s) => s.admin)
  useDb((s) => s.portal)
  const [checks, setChecks] = useState({ name: false, licence: false, expiry: false, qualification: false })
  const [decision, setDecision] = useState<Decision>('approved')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!a) return null
  const t = api.admin.applicants().find((x) => x.id === id)
  if (!t) return null
  const tick = (k: keyof typeof checks) => setChecks((c) => ({ ...c, [k]: !c[k] }))
  const done = t.status !== 'pending'

  return (
    <PortalPage testID="admin-verify" title={`Verify: ${t.name}`} sub="Documents open in a secure preview and are never downloaded.">
      <Panel title="Documents">
        <Text variant="small">Licence · National ID · Qualification certificate</Text>
        <Text variant="caption" muted>
          Preview is not available in the demo.
        </Text>
      </Panel>
      <Panel title="Checklist">
        <Check testID="chk-name" checked={checks.name} label="Name matches ID" onPress={() => tick('name')} />
        <Check testID="chk-licence" checked={checks.licence} label={`Licence no. ${t.licenceNo} checked with the regulator`} onPress={() => tick('licence')} />
        <Check testID="chk-expiry" checked={checks.expiry} label={`Expiry: ${dayLong(t.licenceExpiry)}`} onPress={() => tick('expiry')} />
        <Check testID="chk-qualification" checked={checks.qualification} label="Qualification verified" onPress={() => tick('qualification')} />
      </Panel>
      {done ? (
        <Banner tone="green" icon="check" title={`Decided: ${t.status}`}>
          {t.message}
        </Banner>
      ) : (
        <Panel title="Decision">
          <Segmented value={decision} onChange={setDecision} options={[{ value: 'approved', label: 'Approve' }, { value: 'info', label: 'Request info' }, { value: 'rejected', label: 'Reject' }]} />
          <Field testID="verify-message" label="Message to applicant" value={message} onChangeText={(v) => { setMessage(v); setError(null) }} multiline minHeight={90} error={error} />
          <Text variant="caption" muted>
            Approving sets an expiry reminder 60 days before the licence runs out.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              testID="verify-submit"
              label="Submit decision"
              onPress={() => {
                const r = api.admin.verify(t.id, decision, message, checks)
                if (!r.ok) return setError(r.error)
                goBack('/admin/therapists')
              }}
            />
          </View>
        </Panel>
      )}
    </PortalPage>
  )
}
