import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { EVENT_KINDS, EVENT_LIMITS, kindLabel, MAX_PENDING_PROPOSALS, PROPOSAL_LEAD_DAYS } from '@/lib/events'
import { whenLabel } from '@/lib/groupChat'
import { startOfEatDay } from '@/lib/time'
import type { EventKind, EventMode } from '@/api/types'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'

const HOUR = 3600_000
const DAY = 24 * HOUR
const HOURS = [8, 9, 10, 12, 14, 16, 18, 19]
const DURATIONS = [45, 60, 90, 120]
const STATUS = { pending: 'Waiting for review', live: 'Live', declined: 'Declined', withdrawn: 'Withdrawn' } as const

/** A therapist proposes a community event (a talk, a workshop, a group walk). A clinical reviewer decides; members see it only once it is approved. */
export default function PortalEvents() {
  const portal = useDb((s) => s.portal)
  const events = useDb((s) => s.events)
  const t = useNow()
  const me = THERAPISTS.find((x) => x.id === portal?.therapistId)?.name
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [kind, setKind] = useState<EventKind>('talk')
  const [mode, setMode] = useState<EventMode>('online')
  const [place, setPlace] = useState('')
  const [day, setDay] = useState(7)
  const [hour, setHour] = useState(18)
  const [mins, setMins] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const startsAt = startOfEatDay(now()) + day * DAY + hour * HOUR
  const mine = events.filter((e) => e.proposedBy && (!me || e.proposedBy === me)).sort((a, b) => b.startsAt - a.startsAt)
  const waiting = mine.filter((e) => e.status === 'pending').length

  async function propose() {
    const r = await api.events.propose({ title, blurb, kind, mode, place, startsAt, durationMin: mins })
    if (!r.ok) {
      setDone(null)
      return setError(r.error)
    }
    setError(null)
    setDone('Sent to a clinical reviewer. You will see the decision here.')
    setTitle('')
    setBlurb('')
    setPlace('')
  }

  return (
    <PortalPage testID="portal-events" title="Events" sub="Propose a talk, workshop or group walk for the Echo community. A clinical reviewer approves it before members see it.">
      <Panel title="Your proposals" style={{ gap: 0 }}>
        {mine.length ? (
          mine.map((e) => (
            <View key={e.id} testID={`pevent-${e.id}`} style={{ paddingVertical: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text variant="label" style={{ flex: 1, minWidth: 220 }}>
                  {e.title}
                </Text>
                <Badge label={e.cancelled ? 'Cancelled' : STATUS[e.status ?? 'live']} tone={e.status === 'live' && !e.cancelled ? 'green' : e.status === 'declined' || e.cancelled ? 'clay' : 'plain'} />
              </View>
              <Text variant="small" muted>
                {kindLabel(e.kind)} · {e.mode === 'online' ? 'online' : 'in person'} · {whenLabel(e.startsAt, t)} · {e.durationMin} min
                {e.status === 'live' ? ` · ${e.interested} interested` : ''}
              </Text>
              {e.status === 'declined' && e.declineReason ? (
                <Banner tone="sun" icon="pencil" title="Why it was declined">
                  {e.declineReason}
                </Banner>
              ) : null}
              {e.status === 'pending' ? <Button testID={`pevent-withdraw-${e.id}`} variant="quiet" size="sm" label="Withdraw" onPress={() => api.events.withdraw(e.id)} /> : null}
            </View>
          ))
        ) : (
          <Text variant="small" muted>
            You haven’t proposed anything yet.
          </Text>
        )}
      </Panel>
      <Panel title="Propose an event" testID="pevent-form">
        <Field testID="pev-title" label="Title" value={title} onChangeText={(v) => { setTitle(v); setError(null); setDone(null) }} maxLength={EVENT_LIMITS.maxTitle} />
        <Field testID="pev-blurb" label="What it is about" value={blurb} onChangeText={(v) => { setBlurb(v); setError(null); setDone(null) }} multiline minHeight={80} maxLength={EVENT_LIMITS.maxBlurb} hint="Write it for members, in plain words. General information, not treatment." />
        <Text variant="small" muted>
          Kind
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EVENT_KINDS.map((k) => (
            <Chip key={k.key} testID={`pev-kind-${k.key}`} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
          ))}
        </View>
        <Text variant="small" muted>
          Where
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip testID="pev-mode-online" label="Online" selected={mode === 'online'} onPress={() => setMode('online')} />
          <Chip testID="pev-mode-in-person" label="In person" selected={mode === 'in-person'} onPress={() => setMode('in-person')} />
        </View>
        <Field
          testID="pev-place"
          label={mode === 'in-person' ? 'Public place' : 'How people join'}
          value={place}
          onChangeText={(v) => { setPlace(v); setError(null); setDone(null) }}
          hint={mode === 'in-person' ? 'A public place with a name, like a park gate or a library. Never a home or your practice.' : 'For example: the link is sent to everyone interested the day before.'}
          maxLength={120}
        />
        <Text variant="small" muted>
          Day (at least {PROPOSAL_LEAD_DAYS} days ahead)
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[3, 4, 5, 7, 10, 14, 21].map((d) => (
            <Chip key={d} testID={`pev-day-${d}`} label={whenLabel(startOfEatDay(now()) + d * DAY, t).split(',')[0]} selected={day === d} onPress={() => setDay(d)} />
          ))}
        </View>
        <Text variant="small" muted>
          Start (East Africa Time) and length
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HOURS.map((h) => (
            <Chip key={h} testID={`pev-hour-${h}`} label={`${String(h).padStart(2, '0')}:00`} selected={hour === h} onPress={() => setHour(h)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DURATIONS.map((m) => (
            <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMins(m)} />
          ))}
        </View>
        <Text variant="caption" muted>
          You run it yourself. {waiting} of {MAX_PENDING_PROPOSALS} proposals waiting.
        </Text>
        {error ? <Banner tone="clay">{error}</Banner> : null}
        {done ? (
          <Banner testID="pev-done" tone="green" icon="check">
            {done}
          </Banner>
        ) : null}
        <Button testID="pev-create" label="Send for review" onPress={propose} />
      </Panel>
    </PortalPage>
  )
}
