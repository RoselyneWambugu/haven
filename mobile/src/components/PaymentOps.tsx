import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadPaymentEvents, loadSmsQueue, resolvePaymentEvent, retrySms, type PaymentEvent, type SmsQueue } from '@/backend/remotePaymentOps'
import { dayShort } from '@/lib/time'
import { useMoney } from '@/store/useMoney'

const LABEL: Record<string, string> = {
  refund_needed: 'Refund needed',
  amount_mismatch: 'Amount didn’t match',
  unverified: 'Not confirmed by Safaricom',
  unknown_callback: 'Unknown payment',
  payment_failed: 'Payment failed',
  bad_callback: 'Unreadable message',
}
const HELP: Record<string, string> = {
  refund_needed: 'The member paid, but the time they chose was taken while they were paying. Refund them by M-Pesa, then record the reference here.',
  amount_mismatch: 'Safaricom reported a different amount from the order. Nothing was given. Check the M-Pesa statement and refund or fix by hand.',
  unverified: 'Safaricom said paid, but asking it directly did not confirm it. The app keeps checking; resolve if it settles or never arrives.',
  unknown_callback: 'A payment message arrived for an order we have no record of. Check the statement.',
}

/** Payments that need a person: refunds owed, amounts that didn't match, and messages that couldn't be trusted. */
export function PaymentEvents() {
  const money = useMoney()
  const [rows, setRows] = useState<PaymentEvent[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await loadPaymentEvents()
    if (r) setRows(r)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!rows) return null
  const todo = rows.filter((r) => !r.resolved && r.kind !== 'payment_failed')

  async function resolve(id: number) {
    const r = await resolvePaymentEvent(id, note)
    if (!r.ok) return setError(r.error)
    setOpen(null)
    setNote('')
    setError(null)
    await load()
  }

  return (
    <Panel title="Payments to reconcile" testID="payment-events">
      {todo.length ? <Banner tone="sun" icon="wallet" title={`${todo.length} to look at`}>Anything marked “Refund needed” means a member is owed money.</Banner> : <Text variant="small" muted>Nothing to reconcile.</Text>}
      {rows.map((e) => (
        <View key={e.id} testID={`pevent-${e.id}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Badge tone={e.resolved ? 'green' : e.kind === 'refund_needed' ? 'clay' : 'sun'} label={e.resolved ? 'Resolved' : LABEL[e.kind] ?? e.kind} />
            <Text variant="small" style={{ flex: 1, minWidth: 200 }}>
              {e.penName ?? 'Unknown member'}{e.what ? ` · ${e.what}` : ''}{e.amountKes ? ` · ${money(e.amountKes)}` : ''} · {dayShort(e.at)}
            </Text>
            {!e.resolved && open !== e.id ? <Button testID={`pevent-open-${e.id}`} size="sm" variant="quiet" label="Resolve" onPress={() => { setOpen(e.id); setNote(''); setError(null) }} /> : null}
          </View>
          {e.detail ? <Text variant="caption" muted>{e.detail}</Text> : null}
          {!e.resolved && HELP[e.kind] ? <Text variant="caption" muted>{HELP[e.kind]}</Text> : null}
          {e.resolved ? <Text variant="caption" muted>{e.resolvedBy}: {e.resolution}</Text> : null}
          {open === e.id ? (
            <View style={{ gap: 8 }}>
              <Field testID="pevent-note" label="What did you do? (for example the refund reference)" value={note} onChangeText={(v) => { setNote(v); setError(null) }} error={error} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID="pevent-resolve" size="sm" label="Mark resolved" onPress={() => resolve(e.id)} />
                <Button size="sm" variant="ghost" label="Cancel" onPress={() => setOpen(null)} />
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </Panel>
  )
}

/** The text message queue: how much is waiting, and the ones that failed three times. */
export function SmsQueuePanel() {
  const [q, setQ] = useState<SmsQueue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await loadSmsQueue()
    if (r) setQ(r)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!q) return null
  return (
    <Panel title="Text messages" testID="sms-queue">
      <Text variant="small">
        {q.queued} waiting{q.oldestQueuedMinutes !== null && q.queued > 0 ? ` (oldest ${q.oldestQueuedMinutes} min)` : ''} · {q.sent24h} sent in the last day · {q.failed} failed
      </Text>
      {q.queued > 0 && (q.oldestQueuedMinutes ?? 0) > 15 ? <Banner tone="sun" icon="clock">Texts are waiting longer than usual. Check the Africa’s Talking secrets and the sms_drain_token vault secret.</Banner> : null}
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {q.failures.map((f) => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text variant="small" style={{ flex: 1, minWidth: 200 }}>
            {f.kind} to a number ending {f.phoneTail} · {dayShort(f.at)} · {f.error ?? 'failed'}
          </Text>
          <Button testID={`sms-retry-${f.id}`} size="sm" variant="quiet" label="Try again" onPress={async () => { const r = await retrySms(f.id); setError(r.ok ? null : r.error); await load() }} />
        </View>
      ))}
    </Panel>
  )
}
