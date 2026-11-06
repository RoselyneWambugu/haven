import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, Stat } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { canManageEvents } from '@/lib/admin'
import { now } from '@/lib/clock'
import { EVENT_KINDS, EVENT_LIMITS, eventEnd, isHappeningNow, isLive, isOver, kindLabel } from '@/lib/events'
import { whenLabel } from '@/lib/groupChat'
import { startOfEatDay } from '@/lib/time'
import type { EventKind, EventMode } from '@/api/types'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'

const HOUR = 3600_000
const DAY = 24 * HOUR
const HOURS = [8, 9, 10, 12, 14, 16, 18, 19]
const DURATIONS = [45, 60, 90, 120]

/** Community events: webinars, workshops and walks. Clinical reviewers and Admins schedule them and can cancel one that has not finished. */
export default function Events() {
  const a = useDb((s) => s.admin)
  const events = useDb((s) => s.events)
  const t = useNow()
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [kind, setKind] = useState<EventKind>('webinar')
  const [mode, setMode] = useState<EventMode>('online')
  const [place, setPlace] = useState('')
  const [host, setHost] = useState('Echo')
  const [day, setDay] = useState(2)
  const [hour, setHour] = useState(18)
  const [mins, setMins] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)
  const [declineWhy, setDeclineWhy] = useState('')
  const [decideError, setDecideError] = useState<string | null>(null)
  if (!a) return null
  const allowed = canManageEvents(a.role)
  const startsAt = startOfEatDay(now()) + day * DAY + hour * HOUR
  const proposals = events.filter((e) => e.status === 'pending').sort((x, y) => x.startsAt - y.startsAt)
  const upcoming = events.filter((e) => isLive(e) && !e.cancelled && !isOver(e, t)).sort((x, y) => x.startsAt - y.startsAt)
  const past = events.filter((e) => e.status === 'declined' || e.status === 'withdrawn' || e.cancelled || isOver(e, t)).sort((x, y) => y.startsAt - x.startsAt).slice(0, 8)

  async function create() {
    const r = await api.events.schedule({ title, blurb, kind, mode, place, startsAt, durationMin: mins, host })
    if (!r.ok) {
      setDone(null)
      return setError(r.error)
    }
    setError(null)
    setDone(`Scheduled for ${whenLabel(startsAt, t)}.`)
    setTitle('')
    setBlurb('')
    setPlace('')
  }

  const row = (e: (typeof events)[number]) => {
    const over = isOver(e, t)
    return (
      <View key={e.id} testID={`aevent-${e.id}`} style={{ paddingVertical: 10, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="label" style={{ flex: 1, minWidth: 220 }}>
            {e.title}
          </Text>
          <Badge label={e.status === 'declined' ? 'Declined' : e.status === 'withdrawn' ? 'Withdrawn' : e.cancelled ? 'Cancelled' : over ? 'Finished' : isHappeningNow(e, t) ? 'Happening now' : kindLabel(e.kind)} tone={e.cancelled || e.status === 'declined' ? 'clay' : isHappeningNow(e, t) ? 'green' : 'plain'} />
        </View>
        <Text variant="small" muted>
          {whenLabel(e.startsAt, t)} · {e.durationMin} min · {e.mode === 'online' ? 'online' : 'in person'} · hosted by {e.host} · {e.interested} interested
          {e.proposedBy ? ` · proposed by ${e.proposedBy}` : e.createdBy ? ` · scheduled by ${e.createdBy}` : ''}
        </Text>
        {e.cancelled ? (
          <Text variant="caption" muted>
            Cancelled: {e.cancelled.reason}
          </Text>
        ) : null}
        {e.status === 'declined' && e.declineReason ? (
          <Text variant="caption" muted>
            Declined: {e.declineReason}
          </Text>
        ) : null}
        {allowed && isLive(e) && !e.cancelled && !over ? (
          cancelling === e.id ? (
            <View style={{ gap: 8 }}>
              <Field testID="ev-cancel-reason" label="Reason (required, shown on the event)" value={why} onChangeText={(v) => { setWhy(v); setCancelError(null) }} error={cancelError} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  testID="ev-cancel-confirm"
                  variant="danger"
                  size="sm"
                  label="Cancel this event"
                  onPress={async () => {
                    const r = await api.events.cancel(e.id, why)
                    if (!r.ok) return setCancelError(r.error)
                    setCancelling(null)
                    setWhy('')
                  }}
                />
                <Button variant="ghost" size="sm" label="Keep it" onPress={() => setCancelling(null)} />
              </View>
            </View>
          ) : (
            <Button testID={`ev-cancel-${e.id}`} variant="quiet" size="sm" label="Cancel" onPress={() => { setCancelling(e.id); setWhy(''); setCancelError(null) }} />
          )
        ) : null}
      </View>
    )
  }

  return (
    <PortalPage testID="admin-events" title="Events" sub="Webinars, workshops and walks for the community. Members see them under Community, Events, and say they are interested.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value={String(upcoming.length)} label="Coming up" />
        <Stat value={String(proposals.length)} label="Proposals waiting" tone={proposals.length ? 'sun' : undefined} />
        <Stat value={String(upcoming.reduce((n, e) => n + e.interested, 0))} label="Interested in total" />
      </View>
      {proposals.length ? (
        <Panel title="Proposed by therapists" testID="ev-proposals" tone="sun">
          <Text variant="small" muted>
            Approve to put it in front of members. Decline with a reason so the therapist can improve it. In-person events must be in a public place.
          </Text>
          {proposals.map((e) => (
            <View key={e.id} testID={`aproposal-${e.id}`} style={{ paddingVertical: 8, gap: 6 }}>
              <Text variant="label">{e.title}</Text>
              <Text variant="small" muted>
                {kindLabel(e.kind)} · {e.mode === 'online' ? 'online' : 'in person'} · {whenLabel(e.startsAt, t)} · {e.durationMin} min · proposed by {e.proposedBy ?? e.host}
              </Text>
              <Text variant="small">{e.place}</Text>
              <Text variant="small">{e.blurb}</Text>
              {allowed ? (
                declining === e.id ? (
                  <View style={{ gap: 8 }}>
                    <Field testID="ev-decline-reason" label="Reason (the therapist reads this)" value={declineWhy} onChangeText={(v) => { setDeclineWhy(v); setDecideError(null) }} error={decideError} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button
                        testID="ev-decline-confirm"
                        variant="danger"
                        size="sm"
                        label="Decline"
                        onPress={async () => {
                          const r = await api.events.decide(e.id, false, declineWhy)
                          if (!r.ok) return setDecideError(r.error)
                          setDeclining(null)
                          setDeclineWhy('')
                        }}
                      />
                      <Button variant="ghost" size="sm" label="Back" onPress={() => setDeclining(null)} />
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      testID={`ev-approve-${e.id}`}
                      size="sm"
                      label="Approve"
                      onPress={async () => {
                        const r = await api.events.decide(e.id, true)
                        setDecideError(r.ok ? null : r.error)
                      }}
                    />
                    <Button testID={`ev-decline-${e.id}`} variant="quiet" size="sm" label="Decline" onPress={() => { setDeclining(e.id); setDeclineWhy(''); setDecideError(null) }} />
                  </View>
                )
              ) : null}
            </View>
          ))}
          {decideError && declining === null ? <Banner tone="clay">{decideError}</Banner> : null}
        </Panel>
      ) : null}
      <Panel title="Coming up" style={{ gap: 0 }}>
        {upcoming.length ? upcoming.map(row) : <Text variant="small" muted>Nothing scheduled.</Text>}
      </Panel>
      {allowed ? (
        <Panel title="Schedule an event" testID="ev-schedule">
          <Field testID="ev-title" label="Title" value={title} onChangeText={(v) => { setTitle(v); setError(null); setDone(null) }} maxLength={EVENT_LIMITS.maxTitle} />
          <Field testID="ev-blurb" label="What it is about" value={blurb} onChangeText={(v) => { setBlurb(v); setError(null); setDone(null) }} multiline minHeight={80} maxLength={EVENT_LIMITS.maxBlurb} />
          <Text variant="small" muted>
            Kind
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EVENT_KINDS.map((k) => (
              <Chip key={k.key} testID={`ev-kind-${k.key}`} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
            ))}
          </View>
          <Text variant="small" muted>
            Where
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip testID="ev-mode-online" label="Online" selected={mode === 'online'} onPress={() => setMode('online')} />
            <Chip testID="ev-mode-in-person" label="In person" selected={mode === 'in-person'} onPress={() => setMode('in-person')} />
          </View>
          <Field
            testID="ev-place"
            label={mode === 'in-person' ? 'Public place' : 'How people join'}
            value={place}
            onChangeText={(v) => { setPlace(v); setError(null); setDone(null) }}
            hint={mode === 'in-person' ? 'A public place with a name, like a park gate or a library. Never a home.' : 'For example: the link is sent to everyone interested the day before.'}
            maxLength={120}
          />
          <Field testID="ev-host" label="Run by" value={host} onChangeText={(v) => { setHost(v); setError(null) }} maxLength={60} />
          <Text variant="small" muted>
            Day
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((d) => (
              <Chip key={d} testID={`ev-day-${d}`} label={whenLabel(startOfEatDay(now()) + d * DAY, t).split(',')[0]} selected={day === d} onPress={() => setDay(d)} />
            ))}
          </View>
          <Text variant="small" muted>
            Start (East Africa Time) and length
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {HOURS.map((h) => (
              <Chip key={h} testID={`ev-hour-${h}`} label={`${String(h).padStart(2, '0')}:00`} selected={hour === h} onPress={() => setHour(h)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DURATIONS.map((m) => (
              <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMins(m)} />
            ))}
          </View>
          <Text variant="caption" muted>
            Ends {whenLabel(eventEnd({ startsAt, durationMin: mins }), t)}.
          </Text>
          {error ? <Banner tone="clay">{error}</Banner> : null}
          {done ? (
            <Banner testID="ev-done" tone="green" icon="check">
              {done}
            </Banner>
          ) : null}
          <Button testID="ev-create" label="Schedule" onPress={create} />
        </Panel>
      ) : (
        <Banner tone="sun" icon="lock">
          Only clinical reviewers and Admins schedule or cancel events.
        </Banner>
      )}
      <Panel title="Recent" style={{ gap: 0 }}>
        {past.length ? past.map(row) : <Text variant="small" muted>None yet.</Text>}
      </Panel>
    </PortalPage>
  )
}
