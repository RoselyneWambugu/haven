import { useState } from 'react'
import { View } from 'react-native'
import { api, type PlanId } from '@/api'
import { Button } from '@/components/Button'
import { Badge, Radio, ToggleRow } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ALWAYS_FREE } from '@/data/help'
import { includesList } from '@/lib/content'
import { useDb } from '@/store/db'
import { go } from '@/lib/nav'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

/** Plans. Urgent help, the help centre and the community to read are always free, and the screen says so. */
export default function Plans() {
  const money = useMoney()
  const PLANS = useDb((s) => s.content.plans).filter((p) => p.enabled)
  const [plan, setPlan] = useState<PlanId>(PLANS.find((p) => p.id === 'monthly')?.id ?? PLANS[0].id)
  const [auto, setAuto] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chosen = PLANS.find((p) => p.id === plan) ?? PLANS[0]

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
        A plan covers peer chat. Therapist sessions are paid for one at a time.
      </Text>
      {PLANS.map((p) => (
        <Radio
          key={p.id}
          testID={`plan-${p.id}`}
          selected={plan === p.id}
          onPress={() => setPlan(p.id)}
          label={`${p.label} · ${money(p.priceKes)} ${p.period}`}
          sub={p.blurb}
        />
      ))}
      {plan !== 'daily' ? <ToggleRow testID="plan-auto" on={auto} onChange={setAuto} label="Renew automatically. Cancel any time." /> : null}
      <Card tone="lichen">
        <Text variant="label">Your plan includes</Text>
        {includesList(chosen).map((x) => (
          <View key={x} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Icon name="check" size={18} color={colors.mossDeep} />
            <Text variant="small" style={{ flex: 1 }}>
              {x}
            </Text>
          </View>
        ))}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="label">Always free</Text>
          <Badge label="No plan needed" />
        </View>
        {ALWAYS_FREE.map((x) => (
          <View key={x} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Icon name="check" size={18} color={colors.mossDeep} />
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
