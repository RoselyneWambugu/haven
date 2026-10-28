import { advanceClock, resetClock } from '@/lib/clock'
import { uid } from '@/lib/id'
import { now } from '@/lib/clock'
import { getDb, resetDb, update, updateAccount } from '@/store/db'
import { showToast } from '@/store/toast'
import type { DemoControls, Notice, PlanId, StandingState } from './types'

/** Switches for reviewers. They let you see states that normally take days or need real staff. */
export const demo: DemoControls & { showPrices(on: boolean): void; addNotice(): void; startNextGroupChat(): void } = {
  grantPlan(planId: PlanId) {
    const plan = getDb().content.plans.find((p) => p.id === planId)!
    const t = now()
    update({ subscription: { planId, startedAt: t, endsAt: t + plan.days * 24 * 3600_000, autoRenew: true, cancelledAt: null, method: 'mpesa', receiptNo: 'EC-DEMO' } })
    showToast(`Demo: ${plan.label} plan granted.`)
  },
  lapsePlan() {
    const sub = getDb().subscription
    if (!sub) return showToast('Demo: there is no plan to lapse.')
    update({ subscription: { ...sub, endsAt: now() - 60_000 } })
    showToast('Demo: plan lapsed. Chats are read-only.')
  },
  setStanding(s: StandingState) {
    updateAccount((a) => ({ ...a, standing: s }))
    showToast(`Demo: account is now ${s === 'good' ? 'in good standing' : s}.`)
  },
  failNextPayment(on: boolean) {
    update((st) => ({ demo: { ...st.demo, failNextPayment: on } }))
  },
  newDeviceAlert() {
    update((st) => ({ demo: { ...st.demo, alertDevice: { id: uid('dev'), name: 'Samsung A14', kind: 'phone', lastActiveAt: now(), approxPlace: 'near Eldoret', current: false } } }))
  },
  advanceClock(minutes: number) {
    advanceClock(minutes)
    update((s) => ({ ...s }))
    showToast(`Demo: time moved forward ${minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`}.`)
  },
  showPrices(on: boolean) {
    update((s) => ({ demo: { ...s.demo, showPrices: on } }))
  },
  /** Signs you up for the next group chat and starts it now, so you can see the room. */
  startNextGroupChat() {
    const t = now()
    const next = getDb().groupChats.filter((g) => g.startsAt + g.durationMin * 60_000 > t).sort((a, b) => a.startsAt - b.startsAt)[0]
    if (!next) return showToast('Demo: there is no group chat to start.')
    update((s) => ({ groupChats: s.groupChats.map((g) => (g.id === next.id ? { ...g, registered: true, startsAt: t - 20_000 } : g)) }))
    showToast('Demo: the next group chat is open. Find it under Chats.')
  },
  addNotice() {
    const n: Notice = {
      id: uid('n'), kind: 'warning', rule: 'Sharing contact details',
      explanation: 'Phone numbers and links can’t be shared on Echo. It keeps everyone anonymous.',
      at: now() - 6 * 24 * 3600_000, expiresAt: now() + 84 * 24 * 3600_000, appeal: 'none',
    }
    updateAccount((a) => ({ ...a, notices: [n, ...a.notices] }))
    showToast('Demo: a warning was added to Account standing.')
  },
  reset() {
    resetClock()
    void resetDb()
  },
}
