import { useState } from 'react'
import { Share, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Segmented } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, Stat } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { DEMO_REAUTH_CODE } from '@/api/portal'
import { dayShort } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

const MODE = { chat: 'Chat', voice: 'Voice', video: 'Video' } as const

/** Earnings (THR-20). Amounts are placeholders until fees and tax are decided (D3). Changing the payout needs a fresh check. */
export default function Earnings() {
  const p = useDb((s) => s.portal)
  useDb((s) => s.demo.showPrices)
  const money = useMoney()
  const [sheet, setSheet] = useState(false)
  const [code, setCode] = useState('')
  const [method, setMethod] = useState('')
  const [schedule, setSchedule] = useState<'weekly' | 'monthly'>('weekly')
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  if (!p) return null
  const e = api.portal.earnings()

  async function statement() {
    const lines = ['Date,Client,Mode,Gross,Fee,Net', ...e.rows.map((r) => `${dayShort(r.at)},${r.client},${r.mode},${money(r.gross)},${money(r.fee)},${money(r.net)}`)]
    try {
      await Share.share({ message: lines.join('\n'), title: 'Echo statement' })
    } catch {
      // Dismissed.
    }
  }

  return (
    <PortalPage testID="portal-earnings" title="Earnings" sub="Fees and tax are placeholders until they’re decided.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value={money(e.available)} label="Available" />
        <Stat value={money(e.pending)} label="Pending (24 hour hold)" />
      </View>
      <Panel title="Sessions">
        <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          {['Date', 'Client', 'Gross', 'Fee', 'Net'].map((h, i) => (
            <Text key={h} variant="caption" muted bold style={{ flex: i === 1 ? 2 : 1 }}>
              {h}
            </Text>
          ))}
        </View>
        {e.rows.map((r) => (
          <View key={r.id} testID={`earn-${r.id}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36 }}>
            <Text variant="small" style={{ flex: 1 }}>
              {dayShort(r.at)}
            </Text>
            <Text variant="small" style={{ flex: 2 }} numberOfLines={1}>
              {r.client} · {MODE[r.mode as keyof typeof MODE]}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {money(r.gross)}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {money(r.fee)}
            </Text>
            <Text variant="small" bold style={{ flex: 1 }}>
              {money(r.net)}
            </Text>
          </View>
        ))}
      </Panel>
      <Panel title="Payout">
        <Text variant="body">{p.payout.method}</Text>
        <Text variant="small" muted>
          Paid {p.payout.schedule === 'weekly' ? 'weekly, on Fridays' : 'monthly'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button testID="change-payout" variant="quiet" label="Change payout" onPress={() => { setSheet(true); setChecked(false); setCode(''); setError(null); setMethod(p.payout.method); setSchedule(p.payout.schedule) }} />
          <Button testID="statement" variant="ghost" label="Download statement" onPress={statement} />
        </View>
      </Panel>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Change payout">
        {!checked ? (
          <>
            <Text variant="small">For your security, enter the code we sent to your phone.</Text>
            <Banner tone="sun" icon="lock" title="Demo code">
              {DEMO_REAUTH_CODE}
            </Banner>
            <Field testID="payout-code" label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} error={error} />
            <Button
              testID="payout-verify"
              label="Verify"
              onPress={() => {
                const r = api.portal.reauth(code)
                if (!r.ok) return setError(r.error)
                setChecked(true)
                setError(null)
              }}
            />
          </>
        ) : (
          <>
            <Field testID="payout-method" label="M-Pesa number" value={method} onChangeText={setMethod} />
            <Segmented value={schedule} onChange={setSchedule} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
            {error ? <Banner tone="clay">{error}</Banner> : null}
            <Button
              testID="payout-save"
              label="Save"
              onPress={() => {
                const r = api.portal.changePayout(method.trim(), schedule)
                if (!r.ok) return setError(r.error)
                setSheet(false)
              }}
            />
          </>
        )}
      </Sheet>
    </PortalPage>
  )
}
