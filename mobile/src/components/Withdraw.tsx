import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadEarnings, requestPayout, type Earnings } from '@/backend/remoteFees'
import { dayShort } from '@/lib/time'
import { useMoney } from '@/store/useMoney'

/** What can be withdrawn after the platform fee, and past withdrawals. Earnings clear 24 hours after a session. */
export function Withdraw({ refreshKey }: { refreshKey?: unknown }) {
  const money = useMoney()
  const [e, setE] = useState<Earnings | null>(null)
  const [msg, setMsg] = useState<{ tone: 'green' | 'clay'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await loadEarnings()
    if (d) setE(d)
  }, [])
  useEffect(() => {
    void load()
  }, [load, refreshKey])
  if (!e) return null

  async function withdraw() {
    setBusy(true)
    const r = await requestPayout()
    setBusy(false)
    setMsg(r.ok ? { tone: 'green', text: `Asked for ${money(r.value.netKes)}. Billing will send it to your payout number and mark it paid here.` } : { tone: 'clay', text: r.error })
    await load()
  }

  return (
    <Panel title="Withdraw" testID="withdraw">
      <Text variant="small" muted>
        Echo keeps {e.feePct}% of each session’s price. The fee on a session is fixed when it is completed.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text variant="body">
          Available after the fee: <Text variant="body" bold>{money(e.availableNet)}</Text> from {e.availableSessions} {e.availableSessions === 1 ? 'session' : 'sessions'}
        </Text>
        <Button testID="withdraw-send" size="sm" label="Withdraw" disabled={busy || e.availableNet <= 0} onPress={withdraw} />
      </View>
      {e.owedBackKes > 0 ? <Banner tone="sun" icon="wallet" title={`${money(e.owedBackKes)} is being taken off`}>A session you were paid for was refunded to the member. It comes off your next withdrawal.</Banner> : null}
      {e.minPayoutKes > 0 ? <Text variant="caption" muted>The smallest withdrawal is {money(e.minPayoutKes)}.</Text> : null}
      {e.pendingNet > 0 ? <Text variant="caption" muted>{money(e.pendingNet)} more clears within 24 hours.</Text> : null}
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {e.payouts.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text variant="small" style={{ flex: 1, minWidth: 180 }}>
            {p.id} · {money(p.netKes)}{p.adjustmentKes ? ` (after ${money(p.adjustmentKes)} taken off for a refund)` : ''} · asked {dayShort(p.requestedAt)}{p.reference ? ` · ref ${p.reference}` : ''}
          </Text>
          <Badge tone={p.status === 'paid' ? 'green' : 'plain'} label={p.status === 'paid' ? 'Paid' : 'With billing'} />
        </View>
      ))}
    </Panel>
  )
}
