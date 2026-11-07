import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import type { SessionMoneyCfg } from '@/api/types'
import { Button } from '@/components/Button'
import { Panel, Stepper } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { cancelSplit, memberNoShowSplit, validateSessionMoney } from '@/lib/sessionMoney'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'

const EXAMPLE_KES = 1500

/**
 * Configuration, Sessions: what a cancelled or missed paid session costs and who gets what, how long a member waits for a therapist,
 * the discount after a therapist misses a session, and when repeated missed sessions warn and pause a therapist. The examples under
 * each group are worked out from the numbers on screen, before anything is saved.
 */
export function SessionMoneyConfig({ canEdit }: { canEdit: boolean }) {
  const saved = useDb((s) => s.content.sessionMoney)
  const money = useMoney()
  const [c, setC] = useState<SessionMoneyCfg>(saved)
  const [msg, setMsg] = useState<{ tone: 'green' | 'clay'; text: string } | null>(null)
  // When the saved numbers change (a save, or a refresh from the server), the screen shows them.
  useEffect(() => setC(saved), [saved])
  const set = (change: Partial<SessionMoneyCfg>) => {
    setC({ ...c, ...change })
    setMsg(null)
  }
  const problem = validateSessionMoney(c)
  const dirty = JSON.stringify(c) !== JSON.stringify(saved)
  const eg = (n: number) => money(n)
  const late = cancelSplit(0, 0, EXAMPLE_KES, c)
  const noShow = memberNoShowSplit(EXAMPLE_KES, c)
  const off = (n: number) => (n === 0 ? 'off' : String(n))

  async function save() {
    const r = await api.config.setSessionMoney(c)
    setMsg(r.ok ? { tone: 'green', text: 'Saved. It applies to sessions cancelled or missed from now on.' } : { tone: 'clay', text: r.error ?? 'Something went wrong.' })
  }

  return (
    <View style={{ gap: 14 }} testID="session-money-config">
      <Panel title="Cancelling a paid session" testID="cf-cancelling">
        <Text variant="small" muted>
          The money is held when a member pays and shared out afterwards. Before the window below, cancelling returns everything.
        </Text>
        <Stepper label="Late-cancellation window, minutes before the start" value={c.lateCancelMinutes} min={0} max={2880} step={15} onChange={(n) => set({ lateCancelMinutes: n })} />
        <Stepper label="Fee kept for a late cancellation, % of what was paid" value={c.lateCancelFeePct} min={0} max={100} step={5} onChange={(n) => set({ lateCancelFeePct: n })} />
        <Stepper label="Of that fee, % that goes to the therapist" value={c.lateCancelTherapistSharePct} min={0} max={100} step={10} onChange={(n) => set({ lateCancelTherapistSharePct: n })} />
        <Text testID="cf-example-late" variant="caption" muted>
          {`On a ${eg(EXAMPLE_KES)} session cancelled inside the window: ${eg(late.refundKes)} goes back, the therapist gets ${eg(late.therapistKes)} and Echo keeps ${eg(late.platformKes)}.`}
        </Text>
      </Panel>

      <Panel title="A member who doesn’t come" testID="cf-noshow">
        <Text variant="small" muted>
          A therapist can only mark a no-show for a client who never joined. Whatever isn’t refunded or paid to the therapist stays with Echo.
        </Text>
        <Stepper label="% refunded to the member" value={c.noShowRefundPct} min={0} max={100} step={5} onChange={(n) => set({ noShowRefundPct: n })} />
        <Stepper label="% paid to the therapist" value={c.noShowTherapistPct} min={0} max={100} step={5} onChange={(n) => set({ noShowTherapistPct: n })} />
        <Text testID="cf-example-noshow" variant="caption" muted>
          {`On a ${eg(EXAMPLE_KES)} session: ${eg(noShow.refundKes)} goes back, the therapist gets ${eg(noShow.therapistKes)} and Echo keeps ${eg(noShow.platformKes)}.`}
        </Text>
      </Panel>

      <Panel title="A therapist who doesn’t come" testID="cf-therapist-late">
        <Stepper label="Minutes a member waits before they can leave with everything back" value={c.therapistWaitMinutes} min={5} max={60} step={5} onChange={(n) => set({ therapistWaitMinutes: n })} />
        <Stepper label="Discount on the next booking with that therapist, % (0 turns it off)" value={c.flakeDiscountPct} min={0} max={50} step={5} onChange={(n) => set({ flakeDiscountPct: n })} />
        <Stepper label="Days the discount lasts" value={c.flakeDiscountDays} min={1} max={365} step={15} onChange={(n) => set({ flakeDiscountDays: n })} />
        <Text variant="caption" muted>
          Echo bears the discount: the therapist is paid, and charged the platform fee, on their listed price. Each missed session also counts as a 1-star rating.
        </Text>
      </Panel>

      <Panel title="Repeated missed sessions" testID="cf-repeat">
        <Stepper label="Count missed sessions over this many days" value={c.flakeWindowDays} min={7} max={365} step={7} onChange={(n) => set({ flakeWindowDays: n })} />
        <Stepper label="Warn the therapist at this many missed (0 turns it off)" value={c.flakeWarnAt} min={0} max={10} onChange={(n) => set({ flakeWarnAt: n })} />
        <Stepper label="Pause new clients at this many missed (0 turns it off)" value={c.flakePauseAt} min={0} max={20} onChange={(n) => set({ flakePauseAt: n })} />
        <Text testID="cf-example-repeat" variant="caption" muted>
          {`A therapist ${c.flakeWarnAt ? `gets a warning after ${c.flakeWarnAt} missed in ${c.flakeWindowDays} days` : 'is not warned'}${c.flakePauseAt ? `${c.flakeWarnAt ? ' and' : ' but'} has new clients paused after ${c.flakePauseAt}` : ' and is not paused'}. Warning ${off(c.flakeWarnAt)}, pause ${off(c.flakePauseAt)}.`}
        </Text>
      </Panel>

      {problem ? <Banner tone="clay">{problem}</Banner> : null}
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {canEdit ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button testID="save-session-money" label="Save session rules" disabled={!!problem || !dirty} onPress={save} />
          <Button testID="reset-session-money" variant="ghost" label="Undo changes" disabled={!dirty} onPress={() => { setC(saved); setMsg(null) }} />
        </View>
      ) : null}
    </View>
  )
}
