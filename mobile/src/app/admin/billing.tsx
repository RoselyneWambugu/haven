import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Panel, PortalPage, Stat } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { useDb } from '@/store/db'

/** Billing staff see the pen name and the payment reference. A full name appears only when needed to resolve a dispute, and that view is logged (ADM-12). */
export default function Billing() {
  const a = useDb((s) => s.admin)
  const [error, setError] = useState<string | null>(null)
  if (!a) return null
  const pending = a.refunds.filter((r) => r.status === 'pending')
  return (
    <PortalPage testID="admin-billing" title="Billing" sub="Refund policy is still an open decision (D2). Amounts are not shown.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value="—" label="Revenue (month)" />
        <Stat value="—" label="Failed payments" />
        <Stat value={String(pending.length)} label="Refunds pending" tone={pending.length ? 'sun' : undefined} />
        <Stat value={String(a.unmatchedPayments)} label="Unmatched payments" tone={a.unmatchedPayments ? 'sun' : undefined} />
      </View>
      {a.unmatchedPayments ? (
        <Banner tone="sun" icon="wallet" title="Unmatched payments">
          Payments that can’t be matched to a plan are surfaced right away for reconciliation.
        </Banner>
      ) : null}
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <Panel title="Refund requests">
        {a.refunds.map((r) => (
          <View key={r.id} testID={`refund-${r.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 44 }}>
            <Text variant="label" style={{ width: 60 }}>
              {r.id}
            </Text>
            <Text variant="small" style={{ flex: 1, minWidth: 180 }}>
              {r.penName} · {r.plan} · {r.reason}
            </Text>
            {r.status === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID={`approve-${r.id}`} size="sm" label="Approve" onPress={() => { const x = api.admin.decideRefund(r.id, true); setError(x.ok ? null : x.error) }} />
                <Button testID={`decline-${r.id}`} size="sm" variant="ghost" label="Decline" onPress={() => { const x = api.admin.decideRefund(r.id, false); setError(x.ok ? null : x.error) }} />
              </View>
            ) : (
              <Badge tone="plain" label={`${r.status === 'approved' ? 'Approved' : 'Declined'} by ${r.decidedBy}`} />
            )}
          </View>
        ))}
      </Panel>
    </PortalPage>
  )
}
