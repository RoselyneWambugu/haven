import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, Stat } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { canManageGroups } from '@/lib/admin'
import { now } from '@/lib/clock'
import { endsAt, LIMITS, seatsLeft, status, whenLabel } from '@/lib/groupChat'
import { startOfEatDay } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

const HOUR = 3600_000
const DAY = 24 * HOUR
const HOURS = [9, 10, 12, 14, 16, 18, 19, 20]
const DURATIONS = [30, 45, 60, 90]
const CAPACITIES = [6, 8, 10, 12, 16, 20]

const STATE_LABEL = { upcoming: 'Upcoming', lobby: 'Opening soon', open: 'Open now', ended: 'Ended', cancelled: 'Cancelled' } as const

/** Group chats: see what is scheduled, schedule a new one, or cancel one before it starts. Clinical reviewers and Admins. */
export default function Groups() {
  const a = useDb((s) => s.admin)
  const groups = useDb((s) => s.groupChats)
  const reports = useDb((s) => s.reports)
  const standing = useDb((s) => s.admin?.therapistStanding)
  const t = useNow()
  const [topic, setTopic] = useState('')
  const [blurb, setBlurb] = useState('')
  const [who, setWho] = useState(THERAPISTS[0].id)
  const [day, setDay] = useState(1)
  const [hour, setHour] = useState(14)
  const [mins, setMins] = useState(60)
  const [seats, setSeats] = useState(12)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  if (!a) return null
  const allowed = canManageGroups(a.role)
  const leaders = THERAPISTS.filter((x) => !x.suspended && !standing?.[x.id])
  const upcoming = groups.filter((g) => ['upcoming', 'lobby', 'open'].includes(status(g, t)))
  const past = groups.filter((g) => ['ended', 'cancelled'].includes(status(g, t))).slice(-6).reverse()
  const reported = (id: string) => reports.filter((r) => r.groupChatId === id).length
  const startsAt = startOfEatDay(now()) + day * DAY + hour * HOUR

  function create() {
    const r = api.groups.schedule({ topic, blurb, facilitatorId: who, startsAt, durationMin: mins, capacity: seats })
    if (!r.ok) {
      setDone(null)
      return setError(r.error)
    }
    setError(null)
    setDone(`Scheduled for ${whenLabel(startsAt, t)}.`)
    setTopic('')
    setBlurb('')
  }

  const row = (g: (typeof groups)[number]) => {
    const st = status(g, t)
    const th = THERAPISTS.find((x) => x.id === g.facilitatorId)
    return (
      <View key={g.id} testID={`agroup-${g.id}`} style={{ paddingVertical: 10, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="label" style={{ flex: 1, minWidth: 220 }}>
            {g.topic}
          </Text>
          <Badge label={STATE_LABEL[st]} tone={st === 'open' ? 'green' : st === 'cancelled' ? 'clay' : 'plain'} />
        </View>
        <Text variant="small" muted>
          {whenLabel(g.startsAt, t)} · {g.durationMin} min · led by {th?.name ?? 'a therapist'} · {g.capacity - seatsLeft(g)} of {g.capacity} places taken
          {g.createdBy ? ` · scheduled by ${g.createdBy}` : ''}
        </Text>
        {reported(g.id) ? (
          <Text variant="caption" color={colors.clay}>
            {reported(g.id)} message {reported(g.id) === 1 ? 'report' : 'reports'} on this chat (see Cases)
          </Text>
        ) : null}
        {g.cancelled ? (
          <Text variant="caption" muted>
            Cancelled by {g.cancelled.by}: {g.cancelled.reason}
          </Text>
        ) : null}
        {allowed && (st === 'upcoming' || st === 'lobby') ? (
          cancelling === g.id ? (
            <View style={{ gap: 8 }}>
              <Field testID="cancel-reason" label="Reason (required, members are told it was cancelled)" value={why} onChangeText={(v) => { setWhy(v); setCancelError(null) }} error={cancelError} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  testID="cancel-confirm"
                  variant="danger"
                  size="sm"
                  label="Cancel this group chat"
                  onPress={() => {
                    const r = api.groups.cancel(g.id, why)
                    if (!r.ok) return setCancelError(r.error)
                    setCancelling(null)
                    setWhy('')
                  }}
                />
                <Button variant="ghost" size="sm" label="Keep it" onPress={() => setCancelling(null)} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Button testID={`cancel-${g.id}`} variant="quiet" size="sm" label="Cancel" onPress={() => { setCancelling(g.id); setWhy(''); setCancelError(null) }} />
            </View>
          )
        ) : null}
      </View>
    )
  }

  return (
    <PortalPage testID="admin-groups" title="Group chats" sub="Timed chats on one topic, led by a verified therapist. Schedule one, or cancel one before it starts.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value={String(upcoming.length)} label="Scheduled" />
        <Stat value={String(groups.filter((g) => status(g, t) === 'open').length)} label="Open now" />
        <Stat value={String(groups.reduce((n, g) => n + reported(g.id), 0))} label="Message reports" tone={groups.some((g) => reported(g.id)) ? 'sun' : undefined} />
      </View>
      <Panel title="Scheduled" style={{ gap: 0 }}>
        {upcoming.length ? upcoming.map(row) : <Text variant="small" muted>Nothing scheduled.</Text>}
      </Panel>
      {allowed ? (
        <Panel title="Schedule a group chat" testID="schedule">
          <Field testID="g-topic" label="Topic" value={topic} onChangeText={(v) => { setTopic(v); setError(null); setDone(null) }} maxLength={LIMITS.maxTopic} />
          <Field testID="g-blurb" label="What it is about" value={blurb} onChangeText={(v) => { setBlurb(v); setError(null); setDone(null) }} multiline minHeight={80} maxLength={LIMITS.maxBlurb} />
          <Text variant="small" muted>
            Led by
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {leaders.map((x) => (
              <Chip key={x.id} testID={`g-who-${x.id}`} label={x.name} selected={who === x.id} onPress={() => setWho(x.id)} />
            ))}
          </View>
          <Text variant="small" muted>
            Day
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <Chip key={d} testID={`g-day-${d}`} label={whenLabel(startOfEatDay(now()) + d * DAY, t).split(',')[0]} selected={day === d} onPress={() => setDay(d)} />
            ))}
          </View>
          <Text variant="small" muted>
            Start (East Africa Time)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {HOURS.map((h) => (
              <Chip key={h} testID={`g-hour-${h}`} label={`${String(h).padStart(2, '0')}:00`} selected={hour === h} onPress={() => setHour(h)} />
            ))}
          </View>
          <Text variant="small" muted>
            Length and places
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DURATIONS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMins(m)} />
            ))}
            {CAPACITIES.map((c) => (
              <Chip key={c} label={`${c} places`} selected={seats === c} onPress={() => setSeats(c)} />
            ))}
          </View>
          <Text variant="caption" muted>
            Ends {whenLabel(endsAt({ startsAt, durationMin: mins }), t)}. Deleted 24 hours later unless a message is reported.
          </Text>
          {error ? <Banner tone="clay">{error}</Banner> : null}
          {done ? (
            <Banner testID="g-done" tone="green" icon="check">
              {done}
            </Banner>
          ) : null}
          <Button testID="g-create" label="Schedule" onPress={create} />
        </Panel>
      ) : (
        <Banner tone="sun" icon="lock">
          Only clinical reviewers and Admins schedule or cancel group chats.
        </Banner>
      )}
      <Panel title="Recent" style={{ gap: 0 }}>
        {past.length ? past.map(row) : <Text variant="small" muted>None yet.</Text>}
      </Panel>
    </PortalPage>
  )
}
