import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Bloom } from '@/components/Bloom'
import { Button } from '@/components/Button'
import { Badge, ToggleRow } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { REMOTE } from '@/backend/client'
import { loadPayments, type Payment } from '@/backend/remoteBilling'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { ALWAYS_FREE, daysLeftLabel, graceEndsAt, periodUsed, planIncludes, planState } from '@/lib/plan'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

/** My plan: where the plan stands, what it gives, the last payments, and the few things a member can change. */
export default function MyPlan() {
  const sub = useDb((s) => s.subscription)
  const PLANS = useDb((s) => s.content.plans)
  const grace = useDb((s) => s.content.limits.graceDays)
  const money = useMoney()
  const [confirm, setConfirm] = useState(false)
  const state = planState(sub, now())

  if (!sub || state === 'none') {
    const best = PLANS.find((p) => p.id === 'monthly') ?? PLANS[0]
    return (
      <Screen testID="plan-none" header={<TopBar back />} footer={<Button testID="plan-see-plans" label="See plans" onPress={() => go('/plans')} />}>
        <Text variant="title">My plan</Text>
        <Hero eyebrow="Your plan" title="No plan yet" note="Pick one to unlock the rest of Echo." />
        <IncludesCard title="What a plan gives you" items={planIncludes(best)} />
        <Text variant="small" muted>
          {ALWAYS_FREE}
        </Text>
        {REMOTE ? <Button testID="plan-refund" variant="quiet" label="Payments and refunds" onPress={() => go('/refund')} /> : null}
      </Screen>
    )
  }

  const def = PLANS.find((p) => p.id === sub.planId)!
  const t = now()
  const status = state === 'lapsed' ? 'Ended' : state === 'ending' ? 'Ending' : 'Active'
  const when = state === 'lapsed' ? `Ended ${dayLong(sub.endsAt)}` : sub.autoRenew ? `Renews ${dayLong(sub.endsAt)}` : `Ends ${dayLong(sub.endsAt)}`

  return (
    <Screen testID="plan" header={<TopBar back />}>
      <Text variant="title">My plan</Text>
      <Hero
        eyebrow="Your plan"
        title={def.label}
        status={status}
        statusTone={state === 'lapsed' ? 'clay' : state === 'ending' ? 'sun' : 'green'}
        big={daysLeftLabel(sub, t)}
        progress={state === 'lapsed' ? 1 : periodUsed(sub, t)}
        note={`${money(def.priceKes)} ${def.period} · ${when}`}
        foot={`Receipt ${sub.receiptNo}`}
      />
      {state === 'lapsed' ? (
        <Banner tone="sun" icon="lock" title="Chats are read-only">
          You can read your chats until {dayLong(graceEndsAt(sub))}, with {grace} days to renew.
        </Banner>
      ) : null}
      {state === 'ending' ? (
        <Banner tone="sun" icon="clock" title="Your plan won’t renew">
          You keep full access until {dayLong(sub.endsAt)}.
        </Banner>
      ) : null}
      {state === 'lapsed' ? <Button testID="plan-renew-now" label="Renew" onPress={() => go('/plans')} /> : <Button testID="plan-change" variant="quiet" label="Change or extend plan" onPress={() => go('/plans')} />}
      <IncludesCard title="What your plan includes" items={planIncludes(def)} />
      <Payments sub={sub} planLabel={def.label} amount={def.priceKes} />
      {state !== 'lapsed' && sub.planId !== 'daily' ? <ToggleRow testID="plan-renew" on={sub.autoRenew} onChange={(v) => api.billing.setAutoRenew(v)} label="Renew automatically" sub="Turn it off and you keep full access until the end date." /> : null}
      {state === 'active' && sub.autoRenew ? <Button testID="plan-cancel" variant="dangerGhost" label="Cancel plan" onPress={() => setConfirm(true)} /> : null}
      <Text variant="small" muted>
        {ALWAYS_FREE}
      </Text>
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Cancel your plan?">
        <Text variant="small">You keep full access until {dayLong(sub.endsAt)}. After that, chats become read-only. You won’t be charged again.</Text>
        <Button testID="plan-cancel-confirm" variant="danger" label="Cancel plan" onPress={() => { api.billing.cancelPlan(); setConfirm(false) }} />
        <Button variant="ghost" label="Keep my plan" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  )
}

/** The dark green card at the top, with the flower in the corner, the plan's name, its state and how much of the period is left. */
function Hero({ eyebrow, title, status, statusTone, big, progress, note, foot }: { eyebrow: string; title: string; status?: string; statusTone?: 'green' | 'sun' | 'clay'; big?: string; progress?: number; note?: string; foot?: string }) {
  const tone = statusTone === 'sun' ? colors.sun : statusTone === 'clay' ? '#C98B7A' : '#8FD0A8'
  return (
    <View testID="plan-hero" style={{ borderRadius: 28, backgroundColor: colors.fern, borderWidth: 1.5, borderColor: colors.sun, padding: 20, gap: 10, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', right: -70, top: -70, width: 230, height: 258, opacity: 0.7 }}>
        <Bloom background="transparent" glow={false} />
      </View>
      <Text variant="caption" color={colors.sun}>
        {eyebrow}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text variant="display" color={colors.paper} style={{ fontSize: 34, lineHeight: 38 }}>
          {title}
        </Text>
        {status ? (
          <View testID="plan-status" style={{ borderRadius: 999, borderWidth: 1.2, borderColor: tone, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text variant="caption" color={tone}>
              {status}
            </Text>
          </View>
        ) : null}
      </View>
      {big ? (
        <Text testID="plan-days" variant="h2" color={colors.paper}>
          {big}
        </Text>
      ) : null}
      {progress !== undefined ? (
        <View accessibilityLabel={`${Math.round(progress * 100)} percent of this period has passed`} style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(242,235,221,0.2)', overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 6, backgroundColor: colors.sun }} />
        </View>
      ) : null}
      {note ? (
        <Text variant="small" color={colors.lichen}>
          {note}
        </Text>
      ) : null}
      {foot ? (
        <Text variant="caption" color="#BFCDB8">
          {foot}
        </Text>
      ) : null}
    </View>
  )
}

function IncludesCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card testID="plan-includes">
      <Text variant="h3">{title}</Text>
      <View style={{ gap: 10, marginTop: 10 }}>
        {items.map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="check" size={16} color={colors.moss} />
            <Text variant="small" style={{ flex: 1 }}>
              {i}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

/** The last few payments with their receipt numbers. On the real service they come from the server; in the demo there is the one plan. */
function Payments({ sub, planLabel, amount }: { sub: { receiptNo: string; startedAt: number }; planLabel: string; amount: number | null }) {
  const money = useMoney()
  const [list, setList] = useState<Payment[] | null>(null)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    if (!REMOTE) return
    void loadPayments().then((p) => {
      setOffline(p === null)
      if (p) setList(p)
    })
  }, [])
  const rows: { id: string; title: string; amountKes: number | null; paidAt: number; receiptNo: string | null; refund: Payment['refund'] }[] = REMOTE
    ? (list ?? []).slice(0, 3)
    : [{ id: 'current', title: `${planLabel} plan`, amountKes: amount, paidAt: sub.startedAt, receiptNo: sub.receiptNo, refund: null }]
  return (
    <Card testID="plan-payments">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="h3" style={{ flex: 1 }}>
          Recent payments
        </Text>
        {REMOTE ? <Button testID="plan-refund" variant="quiet" size="sm" label="Payments and refunds" onPress={() => go('/refund')} /> : null}
      </View>
      <View style={{ marginTop: 6 }}>
        {rows.length ? (
          rows.map((p, i) => (
            <View key={p.id} testID={`plan-payment-${p.id}`} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="label" style={{ flex: 1 }}>
                  {p.title}
                </Text>
                {p.refund ? <Badge tone={p.refund.status === 'approved' ? 'green' : 'plain'} label={p.refund.status === 'pending' ? 'Refund requested' : p.refund.status === 'approved' ? 'Refunded' : 'Not refunded'} /> : null}
                <Text variant="label">{money(p.amountKes)}</Text>
              </View>
              <Text variant="caption" muted>
                Paid {dayLong(p.paidAt)}
                {p.receiptNo ? ` · receipt ${p.receiptNo}` : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="small" muted>
            {offline ? 'We couldn’t load your payments. Check your connection and try again.' : REMOTE && list === null ? 'Loading…' : 'No payments yet.'}
          </Text>
        )}
      </View>
    </Card>
  )
}
