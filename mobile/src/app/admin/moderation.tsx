import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, Stat } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { flagMetrics } from '@/lib/admin'
import { useDb } from '@/store/db'

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)

/** AI flags and strike policy (ADM-13). The log refers to messages by ID and never shows text. Policy changes need two admins. */
export default function Moderation() {
  const a = useDb((s) => s.admin)
  const [expiry, setExpiry] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!a) return null
  const m = flagMetrics(a.flags)
  const admin = a.role === 'admin'
  const pc = a.policyChange

  return (
    <PortalPage testID="admin-moderation" title="Moderation" sub="The AI is a signal, never a verdict.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value={pct(m.precision)} label="Precision" />
        <Stat value={pct(m.overturnRate)} label="Overturn rate" />
        <Stat value={m.medianMinutes === null ? '—' : `${m.medianMinutes} min`} label="Median review time" />
      </View>
      <Panel title="AI flags">
        <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
          {['Flag', 'Category', 'Conf.', 'Model', 'Outcome'].map((h, i) => (
            <Text key={h} variant="caption" bold muted style={{ flex: i === 1 ? 2 : 1 }}>
              {h}
            </Text>
          ))}
        </View>
        {a.flags.map((f) => (
          <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 }}>
            <Text variant="small" style={{ flex: 1 }}>
              {f.id}
            </Text>
            <Text variant="small" style={{ flex: 2 }}>
              {f.category}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {f.confidence.toFixed(2)}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {f.model}
            </Text>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Badge tone={f.outcome === 'overturned' ? 'sun' : 'plain'} label={f.outcome === 'upheld' ? 'Upheld' : f.outcome === 'overturned' ? 'Overturned' : 'Open'} />
            </View>
          </View>
        ))}
        <Text variant="caption" muted>
          The log shows message references, never message text.
        </Text>
      </Panel>
      <Panel title="Strike policy (draft)" testID="strike-policy">
        <Text variant="small">S3 → warning · S2 → strike · S1 → immediate suspension.</Text>
        <Text variant="small">
          Expiry <Text variant="small" bold>{a.policy.expiryDays} days</Text> · restriction <Text variant="small" bold>{a.policy.restrictionHours} hours</Text>
        </Text>
        {pc ? (
          <Banner tone="sun" icon="clock" title="A change is waiting for a second admin">
            {pc.policy.expiryDays} days · {pc.policy.restrictionHours} hours, proposed by {pc.requestedBy}.
          </Banner>
        ) : null}
        {pc && admin ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button testID="approve-policy" size="sm" label="Approve change" onPress={() => { const r = api.admin.approvePolicy(); setError(r.ok ? null : r.error) }} />
            <Button size="sm" variant="ghost" label="Withdraw" onPress={() => api.admin.cancelPolicy()} />
          </View>
        ) : null}
        {admin && !pc ? (
          <View style={{ gap: 8 }}>
            <Field testID="policy-expiry" label="Expiry (days)" value={expiry} onChangeText={setExpiry} keyboardType="number-pad" placeholder={String(a.policy.expiryDays)} />
            <Field testID="policy-hours" label="Restriction (hours)" value={hours} onChangeText={setHours} keyboardType="number-pad" placeholder={String(a.policy.restrictionHours)} />
            <Button
              testID="propose-policy"
              variant="quiet"
              label="Propose change"
              onPress={() => {
                const r = api.admin.proposePolicy({ expiryDays: Number(expiry || a.policy.expiryDays), restrictionHours: Number(hours || a.policy.restrictionHours) })
                setError(r.ok ? null : r.error)
              }}
            />
            <Text variant="caption" muted>
              Changes need two admins to approve (D5).
            </Text>
          </View>
        ) : null}
        {!admin ? (
          <Text variant="caption" muted>
            Only an Admin can change the policy.
          </Text>
        ) : null}
        {error ? <Banner tone="clay">{error}</Banner> : null}
      </Panel>
    </PortalPage>
  )
}
