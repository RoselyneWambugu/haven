import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Check } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { changeOutcome, canJoin, joinOpensAt } from '@/lib/booking'
import { canReportTherapistLate, REFUND_NOTE } from '@/lib/sessionMoney'
import { now } from '@/lib/clock'
import { go, goBack } from '@/lib/nav'
import { clock, dayAndClock, dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import type { ReportReason } from '@/api'
import { colors } from '@/theme'

const CONCERNS: { value: ReportReason; label: string }[] = [
  { value: 'therapist-conduct', label: 'Unprofessional or disrespectful' },
  { value: 'therapist-boundaries', label: 'Crossed a personal or sexual boundary' },
  { value: 'therapist-privacy', label: 'Shared or asked for private details' },
]

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const s = useDb((st) => st.sessions.find((x) => x.id === id))
  const money = useMoney()
  const [error, setError] = useState<string | null>(null)
  const [stars, setStars] = useState(0)
  const [rated, setRated] = useState(false)
  const [concern, setConcern] = useState(false)
  const [why, setWhy] = useState<ReportReason>('therapist-conduct')
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const t = s ? THERAPISTS.find((x) => x.id === s.therapistId) : null
  if (!s || !t) {
    return (
      <Screen header={<TopBar back />} testID="session-gone">
        <Text variant="title">Session not found</Text>
        <Button label="My sessions" onPress={() => goBack('/sessions')} />
      </Screen>
    )
  }
  const booked = s.status === 'booked'
  const open = booked && canJoin(s.start, s.end, now())
  const free = changeOutcome(s.start, now()) === 'free'

  async function join() {
    const r = await api.sessions.join(s!.id)
    if (!r.ok) return setError(r.error)
    if (s!.mode === 'chat') go('/chats')
    else go(`/call/${s!.id}`)
  }

  return (
    <Screen testID="session-detail" header={<TopBar back />}>
      <Text variant="title">{t.name}</Text>
      <Card>
        <Text variant="h3">{dayLong(s.start)}</Text>
        <Text variant="body">
          {clock(s.start)} to {clock(s.end)} · {s.mode === 'chat' ? 'Chat' : s.mode === 'voice' ? 'Voice call' : 'Video call'}
        </Text>
        <Text variant="small" muted style={{ marginTop: 6 }}>
          {money(s.priceKes)} · Receipt {s.receiptNo}
        </Text>
      </Card>
      {s.status === 'cancelled' || s.status === 'missed' ? (
        <Banner testID="session-refund" tone={s.lateChargeApplied || s.status === 'missed' ? 'sun' : 'green'} icon="check" title={s.status === 'missed' ? 'You didn’t join' : s.lateChargeApplied ? 'Cancelled in the last hour' : 'Cancelled'}>
          {s.refundKes != null && s.priceKes != null
            ? `${money(s.refundKes)} of ${money(s.priceKes)} goes back to your M-Pesa number${s.refundKes < s.priceKes ? `. ${money(s.priceKes - s.refundKes)} was kept` : ''}. ${REFUND_NOTE}`
            : 'No charge.'}
        </Banner>
      ) : null}
      {booked ? (
        <>
          {open ? (
            <Button testID="join" label="Join now" icon={s.mode === 'video' ? 'video' : s.mode === 'voice' ? 'phone' : 'chats'} onPress={join} />
          ) : (
            <Banner tone="green" icon="clock">
              You can join from {clock(joinOpensAt(s.start))}, 10 minutes before it starts.
            </Banner>
          )}
          {error ? <Banner tone="clay">{error}</Banner> : null}
          {canReportTherapistLate(s.start, s.end, now()) ? (
            <Banner tone="sun" icon="clock" title="Your therapist hasn’t joined">
              You’ve waited 15 minutes. You can leave now and get all of it back.
            </Banner>
          ) : null}
          {canReportTherapistLate(s.start, s.end, now()) ? (
            <Button
              testID="therapist-late"
              label="Leave and get a full refund"
              onPress={async () => {
                const r = await api.sessions.reportTherapistLate(s.id)
                if (!r.ok) setError(r.error)
              }}
            />
          ) : null}
          <Banner tone={free ? 'green' : 'sun'} icon="cal">
            {free
              ? 'Free to reschedule or cancel until the last hour. After that, cancelling keeps 10%, and if you don’t come you get 85% back.'
              : 'It’s within the last hour. Cancelling keeps 10%, and if you don’t come you get 85% back. It can’t be moved now.'}
          </Banner>
          {free ? <Button testID="reschedule" variant="quiet" label="Reschedule" onPress={() => go(`/session-change/${s.id}?action=reschedule`)} /> : null}
          <Button testID="cancel-session" variant="dangerGhost" label="Cancel session" onPress={() => go(`/session-change/${s.id}?action=cancel`)} />
        </>
      ) : null}
      {s.status === 'completed' ? (
        <Card tone="lichen">
          <Text variant="h3">How was your session?</Text>
          {s.rating || rated ? (
            <Text variant="small" style={{ marginTop: 6 }}>
              Thank you. Your rating helps others choose.
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} testID={`star-${n}`} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} onPress={() => setStars(n)} hitSlop={6}>
                    <Icon name="star" size={32} color={n <= stars ? colors.sun : colors.lichenDeep} />
                  </Pressable>
                ))}
              </View>
              <Button label="Send rating" disabled={!stars} onPress={() => { api.sessions.rate(s.id, stars, ''); setRated(true) }} />
            </>
          )}
        </Card>
      ) : null}
      <Button variant="ghost" label="View therapist" onPress={() => go(`/therapists/${t.id}`)} />
      <Text variant="caption" muted>
        {dayAndClock(s.createdAt)} booked
      </Text>
      {s.status === 'completed' ? (
        sent ? (
          <Banner tone="green" icon="shield" title="We received your concern">
            A clinical reviewer will look at it. The therapist is not told who raised it.
          </Banner>
        ) : (
          <Button testID="session-concern" variant="ghost" label="Report a concern about this session" onPress={() => setConcern(true)} />
        )
      ) : null}
      <Sheet visible={concern} onClose={() => setConcern(false)} title="Report a concern" testID="concern-sheet">
        <Text variant="small" muted>
          A clinical reviewer reads every concern. Calls are not recorded, so please say what happened in your own words.
        </Text>
        {CONCERNS.map((c) => (
          <Check key={c.value} testID={`concern-${c.value}`} checked={why === c.value} label={c.label} onPress={() => setWhy(c.value)} />
        ))}
        <Field testID="concern-note" label="What happened" value={note} onChangeText={setNote} multiline minHeight={100} maxLength={1000} />
        <Button
          testID="concern-send"
          label="Send concern"
          disabled={note.trim().length < 10}
          onPress={() => {
            api.report.submit({ target: 'session', targetId: s.id, reason: why, note, sessionId: s.id })
            setConcern(false)
            setSent(true)
          }}
        />
      </Sheet>
    </Screen>
  )
}
