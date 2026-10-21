import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Badge } from '@/components/Controls'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadPayments, requestRefund, type Payment } from '@/backend/remoteBilling'
import { dayLong } from '@/lib/time'
import { useMoney } from '@/store/useMoney'

const STATUS = { pending: 'With our team', approved: 'Refunded', declined: 'Not refunded' } as const

/** Recent payments, and a way to ask for a refund within 14 days of paying. Billing staff decide, and the answer shows here. */
export default function Refund() {
  const money = useMoney()
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [offline, setOffline] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    const p = await loadPayments()
    setOffline(p === null)
    if (p) setPayments(p)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function send(id: string) {
    const r = await requestRefund(id, reason)
    if (!r.ok) return setError(r.error)
    setError(null)
    setAsking(null)
    setReason('')
    setSent(true)
    void load()
  }

  return (
    <Screen testID="refund" header={<TopBar back />}>
      <Text variant="title">Payments and refunds</Text>
      <Text variant="body" muted>
        If you were charged by mistake, or a payment didn’t give you what it should, you can ask for a refund within 14 days of paying.
      </Text>
      {sent ? (
        <Banner testID="refund-sent" tone="green" icon="check" title="We have your request">
          Our team will look at it and the answer will show here.
        </Banner>
      ) : null}
      {offline ? <Banner tone="sun" icon="clock">We couldn’t load your payments. Check your connection and try again.</Banner> : null}
      {payments && payments.length === 0 ? <Text variant="small" muted>No payments yet.</Text> : null}
      {(payments ?? []).map((p) => (
        <Card key={p.id} testID={`payment-${p.id}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="h3" style={{ flex: 1 }}>{p.title}</Text>
            {p.refund ? <Badge tone={p.refund.status === 'approved' ? 'green' : 'plain'} label={STATUS[p.refund.status]} /> : null}
          </View>
          <Text variant="small" muted>
            {money(p.amountKes)} · paid {dayLong(p.paidAt)}{p.receiptNo ? ` · receipt ${p.receiptNo}` : ''}
          </Text>
          {p.refund?.status === 'declined' ? <Text variant="small">We looked at your request and it wasn’t approved. Contact help if you disagree.</Text> : null}
          {p.refund?.status === 'approved' ? <Text variant="small">Refunded. The money goes back to the number or card you paid with.</Text> : null}
          {asking === p.id ? (
            <View style={{ gap: 8 }}>
              <Field testID="refund-reason" label="Why are you asking?" value={reason} onChangeText={(v) => { setReason(v); setError(null) }} multiline minHeight={90} error={error} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID="refund-send" size="sm" label="Ask for a refund" onPress={() => send(p.id)} />
                <Button size="sm" variant="ghost" label="Cancel" onPress={() => { setAsking(null); setError(null) }} />
              </View>
            </View>
          ) : p.refundable ? (
            <View style={{ flexDirection: 'row' }}>
              <Button testID={`refund-ask-${p.id}`} size="sm" variant="quiet" label="Ask for a refund" onPress={() => { setAsking(p.id); setReason(''); setError(null); setSent(false) }} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  )
}
