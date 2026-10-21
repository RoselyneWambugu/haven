import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { api, type PaymentMethod, type PaymentResult } from '@/api'
import { Ripple } from '@/components/Art'
import { Button } from '@/components/Button'
import { Radio } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { maskPhone } from '@/lib/identity'
import { goBack, replace, resetTo } from '@/lib/nav'
import { dayAndClock } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

type Phase = 'review' | 'waiting' | 'success' | 'failed'

/**
 * Checkout for a plan or a session. M-Pesa shows a clear waiting state (the phone prompt) and a plain failure
 * with a retry, never a silent stall (PRD BIL-12 to BIL-16).
 */
export default function Checkout() {
  const co = useDb((s) => s.checkout)
  const plans = useDb((s) => s.content.plans)
  const phone = useDb((s) => s.account?.private.phone ?? '')
  const money = useMoney()
  const [method, setMethod] = useState<PaymentMethod>('mpesa')
  const [phase, setPhase] = useState<Phase>('review')
  const [result, setResult] = useState<PaymentResult | null>(null)
  const kept = useRef(co)
  if (co) kept.current = co
  const item = kept.current?.item
  const amount = kept.current?.amountKes ?? null

  useEffect(() => {
    useDbDone.current = false
    // Leaving without paying drops the pending checkout.
    return () => {
      if (!useDbDone.current) api.billing.cancelCheckout()
    }
  }, [])

  if (!item) {
    return (
      <Screen testID="checkout-empty" header={<TopBar back />}>
        <Text variant="title">Nothing to pay for</Text>
        <Button label="Back" onPress={() => goBack('/home')} />
      </Screen>
    )
  }

  const title =
    item.kind === 'plan'
      ? `${plans.find((p) => p.id === item.planId)?.label} peer plan`
      : `Session with ${THERAPISTS.find((t) => t.id === item.therapistId)?.name}`
  const sub = item.kind === 'plan' ? (item.autoRenew ? 'Renews automatically' : 'Does not renew') : `${dayAndClock(item.start)} · ${item.mode}`

  async function pay() {
    setPhase('waiting')
    const r = await api.billing.pay(method)
    setResult(r)
    useDbDone.current = r.ok
    setPhase(r.ok ? 'success' : 'failed')
  }

  if (phase === 'waiting') {
    return (
      <Screen testID="checkout-waiting" header={<TopBar logo urgent />}>
        <View style={{ height: 220, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <Ripple size={170} />
          <Text variant="title" color={colors.mossDeep}>
            M-Pesa
          </Text>
        </View>
        <Text variant="title" align="center">
          {method === 'mpesa' ? 'Check your phone' : 'Confirming payment'}
        </Text>
        <Text variant="body" muted align="center">
          {method === 'mpesa' ? `Enter your M-Pesa PIN on ${maskPhone(phone)} to pay ${money(amount)}.` : 'This takes a few seconds.'}
        </Text>
        <Text variant="caption" muted align="center">
          Don’t close the app. We’ll update this screen when it goes through.
        </Text>
      </Screen>
    )
  }

  if (phase === 'success') {
    return (
      <Screen
        testID="checkout-success"
        header={<TopBar logo />}
        footer={
          <Button
            testID="checkout-done"
            label={item.kind === 'plan' ? 'Find someone to talk to' : 'View session'}
            onPress={() => (item.kind === 'plan' ? resetTo('/match') : replace(`/sessions/${result?.sessionId}`))}
          />
        }
      >
        <Banner tone="green" icon="check" title="Payment received">
          {title}. Receipt {result?.receiptNo}.
        </Banner>
        <Text variant="title">You’re all set</Text>
        <Text variant="body" muted>
          {item.kind === 'plan' ? 'Your plan is active. You can start matching now.' : 'Your session is booked. We’ll remind you before it starts.'}
        </Text>
      </Screen>
    )
  }

  if (phase === 'failed') {
    return (
      <Screen
        testID="checkout-failed"
        header={<TopBar back />}
        footer={
          <>
            <Button testID="checkout-retry" label="Try again" onPress={pay} />
            <Button variant="ghost" label="Cancel" onPress={() => goBack('/home')} />
          </>
        }
      >
        <Banner tone="clay" icon="clock" title="Payment didn’t go through">
          {result?.failure === 'insufficient' ? 'Your M-Pesa balance was too low.' : result?.failure === 'unavailable' ? 'Payments aren’t switched on yet.' : result?.failure === 'taken' ? 'Someone booked that time while you were paying.' : 'We didn’t get a response from M-Pesa in time.'} You haven’t been charged.
        </Banner>
        <Text variant="body">You can try again, or check that your phone has network and enough balance.</Text>
      </Screen>
    )
  }

  return (
    <Screen testID="checkout" header={<TopBar back />} footer={<Button testID="pay" label={`Pay ${money(amount)}`} onPress={pay} />}>
      <Text variant="title">Checkout</Text>
      <Card>
        <Text variant="h3">{title}</Text>
        <Text variant="small" muted>
          {sub}
        </Text>
        <Text variant="title" style={{ marginTop: 8 }}>
          {money(amount)}
        </Text>
      </Card>
      <Text variant="small" muted>
        Pay with
      </Text>
      <Radio testID="pay-mpesa" selected={method === 'mpesa'} onPress={() => setMethod('mpesa')} label="M-Pesa" sub={`We’ll send a prompt to ${maskPhone(phone)}`} />
      <Radio testID="pay-card" selected={method === 'card'} onPress={() => setMethod('card')} label="Card" sub="Visa or Mastercard" />
      <Text variant="caption" muted>
        Your payment details are never shown to other people. The charge on your statement says “Echo”.
      </Text>
    </Screen>
  )
}

/** True once payment succeeded, so leaving the screen doesn't drop a finished checkout. */
const useDbDone = { current: false }
