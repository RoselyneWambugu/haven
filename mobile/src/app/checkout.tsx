import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { api, type PaymentMethod, type PaymentResult } from '@/api'
import { Ripple } from '@/components/Art'
import { Bloom } from '@/components/Bloom'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { maskPhone, normaliseKenyanPhone } from '@/lib/identity'
import { goBack, replace, resetTo } from '@/lib/nav'
import { planIncludes } from '@/lib/plan'
import { flakeOffer } from '@/lib/sessionMoney'
import { now } from '@/lib/clock'
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
  const accountPhone = useDb((s) => s.account?.private.phone ?? '')
  const mySessions = useDb((s) => s.sessions)
  // A member who signed up with Google has no phone on Echo, so they say which M-Pesa number to charge.
  const [given, setGiven] = useState('')
  const [givenError, setGivenError] = useState<string | null>(null)
  const needsNumber = !accountPhone
  const phone = accountPhone || normaliseKenyanPhone(given) || ''
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

  const planDef = item.kind === 'plan' ? plans.find((p) => p.id === item.planId) : undefined
  const title = item.kind === 'plan' ? `${planDef?.label} plan` : `Session with ${THERAPISTS.find((t) => t.id === item.therapistId)?.name}`
  const listKes = item.kind === 'session' ? (THERAPISTS.find((t) => t.id === item.therapistId)?.priceKes ?? null) : null
  const offPct = listKes && amount !== null && amount < listKes ? Math.round((1 - amount / listKes) * 100) : 0
  const missedBy = item.kind === 'session' && flakeOffer(mySessions, item.therapistId, now()) ? THERAPISTS.find((t) => t.id === item.therapistId)?.name : null
  const sub = item.kind === 'plan' ? (item.autoRenew ? 'Renews automatically' : 'Does not renew') : `${dayAndClock(item.start)} · ${item.mode}`

  async function pay() {
    if (method === 'mpesa' && needsNumber && !normaliseKenyanPhone(given)) return setGivenError('Enter a Kenyan M-Pesa number, like 0712 345 678.')
    setPhase('waiting')
    const r = await api.billing.pay(method, needsNumber ? normaliseKenyanPhone(given) ?? undefined : undefined)
    setResult(r)
    useDbDone.current = r.ok
    setPhase(r.ok ? 'success' : 'failed')
  }

  if (phase === 'waiting') {
    return (
      <Screen testID="checkout-waiting" header={<TopBar logo />}>
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
        <View style={{ borderRadius: 28, backgroundColor: colors.fern, borderWidth: 1.5, borderColor: colors.sun, padding: 20, gap: 6, overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: -70, top: -70, width: 230, height: 258, opacity: 0.7 }}>
            <Bloom background="transparent" glow={false} />
          </View>
          <Text variant="caption" color={colors.sun}>
            Payment received
          </Text>
          <Text variant="display" color={colors.paper} style={{ fontSize: 30, lineHeight: 34 }}>
            {title}
          </Text>
          <Text variant="small" color={colors.lichen}>
            {money(amount)} · Receipt {result?.receiptNo}
          </Text>
        </View>
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
      <View testID="checkout-summary" style={{ borderRadius: 28, backgroundColor: colors.fern, borderWidth: 1.5, borderColor: colors.sun, padding: 20, gap: 6, overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -70, top: -70, width: 230, height: 258, opacity: 0.7 }}>
          <Bloom background="transparent" glow={false} />
        </View>
        <Text variant="caption" color={colors.sun}>
          {item.kind === 'plan' ? 'You’re getting' : 'You’re booking'}
        </Text>
        <Text variant="display" color={colors.paper} style={{ fontSize: 30, lineHeight: 34 }}>
          {title}
        </Text>
        <Text variant="small" color={colors.lichen}>
          {sub}
        </Text>
        <Text variant="h2" color={colors.paper} style={{ marginTop: 8 }}>
          {money(amount)}
        </Text>
        {offPct > 0 ? (
          <Text testID="checkout-discount" variant="small" color={colors.sun}>
            {`${money(listKes)} less ${offPct}%${missedBy ? ` because ${missedBy} missed your last session` : ' with your plan'}`}
          </Text>
        ) : null}
      </View>
      {planDef ? (
        <Card testID="checkout-includes">
          <Text variant="h3">What it includes</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {planIncludes(planDef).map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Icon name="check" size={16} color={colors.moss} />
                <Text variant="small" style={{ flex: 1 }}>
                  {i}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <Text variant="h3">Pay with</Text>
      <MethodCard testID="pay-mpesa" selected={method === 'mpesa'} onPress={() => setMethod('mpesa')} label="M-Pesa" sub={needsNumber ? 'We’ll send a prompt to the number you enter' : `We’ll send a prompt to ${maskPhone(phone)}`} />
      {needsNumber && method === 'mpesa' ? (
        <Field testID="pay-mpesa-number" label="M-Pesa number" prefix="+254" placeholder="712 345 678" value={given} onChangeText={(v) => { setGiven(v); setGivenError(null) }} keyboardType="phone-pad" error={givenError} />
      ) : null}
      <MethodCard testID="pay-card" selected={method === 'card'} onPress={() => setMethod('card')} label="Card" sub="Visa or Mastercard" />
      <Text variant="caption" muted>
        Your payment details are never shown to other people. The charge on your statement says “Echo”.
      </Text>
    </Screen>
  )
}

/** A payment choice drawn like the plan cards: the chosen one is dark green with a gold edge. */
function MethodCard({ selected, label, sub, onPress, testID }: { selected: boolean; label: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}. ${sub}`}
      onPress={onPress}
      style={{ borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: selected ? colors.sun : colors.line, backgroundColor: selected ? colors.fern : colors.white, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="h3" color={selected ? colors.paper : colors.ink}>
          {label}
        </Text>
        <Text variant="small" color={selected ? colors.lichen : colors.muted}>
          {sub}
        </Text>
      </View>
      {selected ? <Icon name="check" size={18} color={colors.sun} /> : null}
    </Pressable>
  )
}

/** True once payment succeeded, so leaving the screen doesn't drop a finished checkout. */
const useDbDone = { current: false }
