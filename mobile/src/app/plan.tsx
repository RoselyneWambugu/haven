import { useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { ToggleRow } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { PLANS } from '@/data/help'
import { CONFIG } from '@/data/config'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { graceEndsAt, planState } from '@/lib/plan'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'

export default function MyPlan() {
  const sub = useDb((s) => s.subscription)
  const money = useMoney()
  const [confirm, setConfirm] = useState(false)
  const state = planState(sub, now())

  if (!sub || state === 'none') {
    return (
      <Screen testID="plan-none" header={<TopBar back />} footer={<Button label="See plans" onPress={() => go('/plans')} />}>
        <Text variant="title">No plan yet</Text>
        <Text variant="body" muted>
          A plan covers peer chat. Urgent help, the help centre and reading the community are always free.
        </Text>
      </Screen>
    )
  }
  const def = PLANS.find((p) => p.id === sub.planId)!
  return (
    <Screen testID="plan" header={<TopBar back />}>
      <Text variant="title">My plan</Text>
      <Card tone="lichen">
        <Text variant="h3">{def.label} plan</Text>
        <Text variant="small">{money(def.priceKes)} {def.period}</Text>
        <Text variant="small" style={{ marginTop: 8 }}>
          {state === 'lapsed' ? `Ended ${dayLong(sub.endsAt)}` : sub.autoRenew ? `Renews ${dayLong(sub.endsAt)}` : `Ends ${dayLong(sub.endsAt)}`}
        </Text>
        <Text variant="caption" muted>
          Receipt {sub.receiptNo}
        </Text>
      </Card>
      {state === 'lapsed' ? (
        <Banner tone="sun" icon="lock" title="Chats are read-only">
          You can read your chats until {dayLong(graceEndsAt(sub))}, with {CONFIG.graceDays} days to renew.
        </Banner>
      ) : null}
      {state === 'ending' ? (
        <Banner tone="sun" icon="clock" title="Your plan won’t renew">
          You keep full access until {dayLong(sub.endsAt)}.
        </Banner>
      ) : null}
      {state !== 'lapsed' && sub.planId !== 'daily' ? <ToggleRow testID="plan-renew" on={sub.autoRenew} onChange={(v) => api.billing.setAutoRenew(v)} label="Renew automatically" /> : null}
      {state === 'lapsed' ? <Button label="Renew" onPress={() => go('/plans')} /> : <Button variant="quiet" label="Change or extend plan" onPress={() => go('/plans')} />}
      {state === 'active' && sub.autoRenew ? <Button testID="plan-cancel" variant="dangerGhost" label="Cancel plan" onPress={() => setConfirm(true)} /> : null}
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Cancel your plan?">
        <Text variant="small">You keep full access until {dayLong(sub.endsAt)}. After that, chats become read-only. You won’t be charged again.</Text>
        <Button testID="plan-cancel-confirm" variant="danger" label="Cancel plan" onPress={() => { api.billing.cancelPlan(); setConfirm(false) }} />
        <Button variant="ghost" label="Keep my plan" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  )
}
