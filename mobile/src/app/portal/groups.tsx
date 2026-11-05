import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { facilitatorRemove, facilitatorRemoveMember, facilitatorSend, loadFacilitatorRooms, type FacilitatorRoom } from '@/backend/remoteGroups'
import { REMOTE } from '@/backend/client'
import { whenLabel } from '@/lib/groupChat'
import { now } from '@/lib/clock'
import { clock } from '@/lib/time'

/** The group chats a therapist leads. They write into the room from the time it opens, ten minutes before the start. */
export default function PortalGroups() {
  const [rooms, setRooms] = useState<FacilitatorRoom[] | null>(null)
  const [text, setText] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [ban, setBan] = useState<{ gid: string; name: string } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!REMOTE) return
    const r = await loadFacilitatorRooms()
    if (r) setRooms(r)
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 4000)
    return () => clearInterval(id)
  }, [load])

  async function send(id: string) {
    const r = await facilitatorSend(id, text[id] ?? '')
    if (!r.ok) return setError(r.error)
    setError(null)
    setText((t) => ({ ...t, [id]: '' }))
    void load()
  }

  return (
    <PortalPage testID="portal-groups" title="Group chats" sub="Rooms you lead. You can write once the room opens, ten minutes before the start.">
      {!REMOTE ? <Banner tone="green">In this demo the facilitator’s lines are scripted. With the live service, you write them here.</Banner> : null}
      {REMOTE && rooms && rooms.length === 0 ? <Banner tone="green">You aren’t leading a group chat in the next few weeks.</Banner> : null}
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {(rooms ?? []).map((g) => {
        const live = g.status === 'lobby' || g.status === 'open'
        return (
          <Panel key={g.id} testID={`room-${g.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="h3" style={{ flexShrink: 1 }}>{g.topic}</Text>
              <Badge label={g.status === 'open' ? 'Open now' : g.status === 'lobby' ? 'Opening' : g.status === 'ended' ? 'Ended' : 'Upcoming'} tone={live ? 'sun' : 'plain'} />
            </View>
            <Text variant="small" muted>
              {whenLabel(g.startsAt, now())} · {g.durationMin} min · {g.registered} of {g.capacity} signed up
            </Text>
            {g.messages.slice(-30).map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text variant="small" style={{ flex: 1, opacity: m.name === 'Echo' ? 0.6 : 1 }}>
                  <Text variant="small" bold>{m.mine ? 'You' : m.name}</Text> <Text variant="caption" muted>{clock(m.at)}</Text>{'  '}{m.text}
                </Text>
                {live && !m.mine && m.name !== 'Echo' ? (
                  <Button testID={`room-hide-${m.id}`} size="sm" variant="dangerGhost" label="Remove" onPress={async () => { const r = await facilitatorRemove(g.id, m.id); setError(r.ok ? null : r.error); void load() }} />
                ) : null}
                {live && !m.mine && m.name !== 'Echo' ? (
                  <Button testID={`room-ban-${m.id}`} size="sm" variant="dangerGhost" label="Remove person" onPress={() => { setBan({ gid: g.id, name: m.name }); setReason('') }} />
                ) : null}
              </View>
            ))}
            {ban && ban.gid === g.id ? (
              <Banner tone="sun" icon="shield">
                Remove {ban.name} from this room? They won’t be able to write or sign up again. Echo’s team is told why.
              </Banner>
            ) : null}
            {ban && ban.gid === g.id ? (
              <View style={{ gap: 8 }}>
                <Field testID="room-ban-reason" label="Reason" placeholder="At least 5 characters" value={reason} onChangeText={(v) => { setReason(v); setError(null) }} />
                <Button testID="room-ban-confirm" label={`Remove ${ban.name}`} variant="danger" disabled={reason.trim().length < 5} onPress={async () => { const r = await facilitatorRemoveMember(g.id, ban.name, reason.trim()); setError(r.ok ? null : r.error); if (r.ok) setBan(null); void load() }} />
                <Button variant="ghost" label="Cancel" onPress={() => setBan(null)} />
              </View>
            ) : null}
            {live ? (
              <View style={{ gap: 8 }}>
                <Field testID={`room-text-${g.id}`} label="Your message" hideLabel placeholder="Write to the room…" value={text[g.id] ?? ''} onChangeText={(v) => { setText((t) => ({ ...t, [g.id]: v })); setError(null) }} />
                <Button testID={`room-send-${g.id}`} label="Send to the room" onPress={() => send(g.id)} />
              </View>
            ) : null}
          </Panel>
        )
      })}
    </PortalPage>
  )
}
