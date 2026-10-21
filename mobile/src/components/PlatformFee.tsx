import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Panel, Stepper } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { decideFee, loadFee, proposeFee, withdrawFee, type FeeState } from '@/backend/remoteFees'

/** The share of each completed session that stays with Echo. A change needs a second Admin; sessions already completed keep the fee they had. */
export function PlatformFee({ canEdit }: { canEdit: boolean }) {
  const [fee, setFee] = useState<FeeState | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ tone: 'green' | 'clay'; text: string } | null>(null)

  const load = useCallback(async () => {
    const f = await loadFee()
    if (f) {
      setFee(f)
      setPct((p) => p ?? f.pct)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!fee) return null

  async function run(p: Promise<{ ok: boolean; error?: string }>, done: string) {
    const r = await p
    setMsg(r.ok ? { tone: 'green', text: done } : { tone: 'clay', text: r.error ?? 'Something went wrong.' })
    await load()
  }

  return (
    <Panel title="Platform fee" testID="platform-fee">
      <Text variant="small" muted>
        Taken from each completed session’s price and fixed on the session when it is completed. A plan’s therapy discount comes out of Echo’s share, not the therapist’s. A refunded session carries no fee.
      </Text>
      <Text variant="body">
        Now <Text variant="body" bold>{fee.pct}%</Text>
      </Text>
      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {fee.pending ? (
        <Banner tone="sun" icon="clock" title={`A change to ${fee.pending.pct}% is waiting for a second Admin`}>
          Proposed by {fee.pending.requestedBy}.
        </Banner>
      ) : null}
      {fee.pending && canEdit ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {fee.pending.mine ? (
            <Button testID="fee-withdraw" size="sm" variant="ghost" label="Withdraw" onPress={() => run(withdrawFee(fee.pending!.id), 'Withdrawn.')} />
          ) : (
            <>
              <Button testID="fee-approve" size="sm" label="Approve change" onPress={() => run(decideFee(fee.pending!.id, true), 'The new fee is live.')} />
              <Button testID="fee-decline" size="sm" variant="ghost" label="Decline" onPress={() => run(decideFee(fee.pending!.id, false), 'Declined.')} />
            </>
          )}
        </View>
      ) : null}
      {canEdit && !fee.pending ? (
        <>
          <Stepper label="Platform fee (%)" value={pct ?? fee.pct} min={0} max={50} onChange={setPct} />
          <View style={{ flexDirection: 'row' }}>
            <Button testID="fee-propose" size="sm" label="Propose this fee" disabled={(pct ?? fee.pct) === fee.pct} onPress={() => run(proposeFee(pct ?? fee.pct), 'Sent for a second Admin to approve.')} />
          </View>
        </>
      ) : null}
    </Panel>
  )
}
