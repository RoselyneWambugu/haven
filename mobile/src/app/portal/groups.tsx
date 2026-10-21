import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { facilitatorSend, loadFacilitatorRooms, type FacilitatorRoom } from '@/backend/remoteGroups'
import { REMOTE } from '@/backend/client'
import { whenLabel } from '@/lib/groupChat'
import { now } from '@/lib/clock'
import { clock } from '@/lib/time'

/** The group chats a therapist leads. They write into the room from the time it opens, ten minutes before the start. */
export default function PortalGroups() {
  const [rooms, setRooms] = useState<FacilitatorRoom[] | null>(null)
  const [text, setText] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

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
              <Text key={m.id} variant="small" style={{ opacity: m.name === 'Echo' ? 0.6 : 1 }}>
                <Text variant="small" bold>{m.mine ? 'You' : m.name}</Text> <Text variant="caption" muted>{clock(m.at)}</Text>{'  '}{m.text}
              </Text>
            ))}
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
