import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadStaffPayouts, markPayoutPaid, type StaffPayout } from '@/backend/remoteFees'
import { dayShort } from '@/lib/time'
import { useMoney } from '@/store/useMoney'

/** Therapists' withdrawals. Send the money by M-Pesa or bank, then mark it paid with the reference. */
export function StaffPayouts() {
  const money = useMoney()
  const [rows, setRows] = useState<StaffPayout[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [ref, setRef] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const p = await loadStaffPayouts()
    if (p) setRows(p)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!rows) return null

  async function pay(id: string) {
    const r = await markPayoutPaid(id, ref)
    if (!r.ok) return setError(r.error)
    setOpen(null)
    setRef('')
    setError(null)
    await load()
  }

  return (
    <Panel title="Therapist payouts" testID="payouts">
      {rows.length === 0 ? <Text variant="small" muted>No withdrawals yet.</Text> : null}
      {rows.map((p) => (
        <View key={p.id} testID={`payout-${p.id}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Text variant="label" style={{ width: 56 }}>{p.id}</Text>
            <Text variant="small" style={{ flex: 1, minWidth: 200 }}>
              {p.therapist} · {money(p.netKes)} to {p.method} · {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'} · asked {dayShort(p.requestedAt)}
            </Text>
            {p.status === 'paid' ? <Badge tone="green" label={`Paid by ${p.paidBy}`} /> : open !== p.id ? <Button testID={`payout-open-${p.id}`} size="sm" label="Mark paid" onPress={() => { setOpen(p.id); setRef(''); setError(null) }} /> : null}
          </View>
          {p.status === 'paid' && p.reference ? <Text variant="caption" muted>Reference {p.reference}</Text> : null}
          {open === p.id ? (
            <View style={{ gap: 8 }}>
              <Text variant="caption" muted>Gross {money(p.grossKes)}, platform fee {money(p.feeKes)}, net {money(p.netKes)}.</Text>
              <Field testID="payout-ref" label="M-Pesa or bank reference" value={ref} onChangeText={(v) => { setRef(v); setError(null) }} error={error} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID="payout-confirm" size="sm" label="Mark paid" onPress={() => pay(p.id)} />
                <Button size="sm" variant="ghost" label="Cancel" onPress={() => setOpen(null)} />
              </View>
            </View>
          ) : null}
        </View>
      ))}
      {error && !open ? <Banner tone="clay">{error}</Banner> : null}
    </Panel>
  )
}
