import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api, type PlanId } from '@/api'
import { Button } from '@/components/Button'
import { Badge, ToggleRow } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { FREE_ITEMS, perDayKes, planIncludes, planState, savingVsDaily } from '@/lib/plan'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

/** Choose a plan. Each is a card to tap: the chosen one turns dark green, like the card on My plan. Urgent help and the help centre are free, and the screen says so. */
export default function Plans() {
  const money = useMoney()
  const all = useDb((s) => s.content.plans)
  const PLANS = all.filter((p) => p.enabled)
  const sub = useDb((s) => s.subscription)
  const [plan, setPlan] = useState<PlanId>(PLANS.find((p) => p.id === 'monthly')?.id ?? PLANS[0].id)
  const [auto, setAuto] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chosen = PLANS.find((p) => p.id === plan) ?? PLANS[0]
  const daily = all.find((p) => p.id === 'daily')
  const state = planState(sub, now())
  const current = sub && state !== 'none' && state !== 'lapsed' ? sub.planId : null

  return (
    <Screen
      testID="plans"
      header={<TopBar back />}
      footer={
        <Button
          testID="plans-continue"
          label={`Continue with ${chosen.label.toLowerCase()}`}
          onPress={async () => {
            const r = await api.billing.createCheckout({ kind: 'plan', planId: plan, autoRenew: auto && plan !== 'daily' })
            if (!r.ok) return setError(r.error)
            go('/checkout')
          }}
        />
      }
    >
      <Text variant="title">Choose a plan</Text>
      <Text variant="body" muted>
        One plan opens the whole of Echo: peer chat, the Community, support spaces, group chats and booking a therapist. Therapist sessions are paid for one at a time.
      </Text>
      {current && sub ? (
        <Banner testID="plans-current" tone="green" icon="check" title="You already have a plan">
          Your {all.find((p) => p.id === current)?.label.toLowerCase()} plan runs until {dayLong(sub.endsAt)}. Pick another to change or extend it.
        </Banner>
      ) : null}
      <View style={{ gap: 12 }}>
        {PLANS.map((p) => {
          const on = plan === p.id
          const day = perDayKes(p)
          const saving = savingVsDaily(p, daily)
          const fg = on ? colors.paper : colors.ink
          const sub2 = on ? colors.lichen : colors.muted
          return (
            <Pressable
              key={p.id}
              testID={`plan-${p.id}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${p.label}, ${money(p.priceKes)} ${p.period}${saving ? `, saves ${saving} percent a day` : ''}`}
              onPress={() => setPlan(p.id)}
              style={{ borderRadius: 24, padding: 18, gap: 6, backgroundColor: on ? colors.fern : '#FBF7EC', borderWidth: on ? 1.5 : 1, borderColor: on ? colors.sun : colors.line }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="h2" color={fg} style={{ flex: 1 }}>
                  {p.label}
                </Text>
                {current === p.id ? <Badge tone="green" label="Your plan" /> : saving && p.id !== 'daily' ? <Badge tone="sun" label={`Saves ${saving}%`} /> : null}
                <View accessibilityElementsHidden style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: on ? colors.sun : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={14} color={colors.sun} /> : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text variant="display" color={fg} style={{ fontSize: 30, lineHeight: 34 }}>
                  {money(p.priceKes)}
                </Text>
                <Text variant="small" color={sub2}>
                  {p.period}
                </Text>
              </View>
              <Text variant="small" color={sub2}>
                {p.blurb}
                {day !== null && p.id !== 'daily' ? ` · about ${money(day)} a day` : ''}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {plan !== 'daily' ? <ToggleRow testID="plan-auto" on={auto} onChange={setAuto} label="Renew automatically" sub="Cancel any time. You keep access until the end of what you paid for." /> : null}
      <Card testID="plans-includes">
        <Text variant="h3">{chosen.label} includes</Text>
        {planIncludes(chosen).map((x) => (
          <View key={x} style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Icon name="check" size={16} color={colors.moss} />
            <Text variant="small" style={{ flex: 1 }}>
              {x}
            </Text>
          </View>
        ))}
      </Card>
      <Card tone="lichen">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="h3">Always free</Text>
          <Badge label="No plan needed" />
        </View>
        {FREE_ITEMS.map((x) => (
          <View key={x} style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Icon name="check" size={16} color={colors.mossDeep} />
            <Text variant="small" style={{ flex: 1 }}>
              {x}
            </Text>
          </View>
        ))}
      </Card>
      {error ? <Banner tone="clay">{error}</Banner> : null}
    </Screen>
  )
}
