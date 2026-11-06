import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { isHappeningNow, isOver, kindLabel } from '@/lib/events'
import { whenLabel } from '@/lib/groupChat'
import { goBack } from '@/lib/nav'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/** An event: when, where, who runs it, and one button to say you are interested. */
export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const event = useDb((s) => s.events.find((e) => e.id === id))
  const plan = usePlan()
  const [error, setError] = useState<string | null>(null)

  if (!event) {
    return (
      <Screen header={<TopBar back />} testID="event-gone">
        <Text variant="title">This event isn’t here</Text>
        <Button label="Back to Community" onPress={() => goBack('/forum')} />
      </Screen>
    )
  }
  if (!plan) {
    return (
      <Screen testID="event-locked" header={<TopBar back />}>
        <PlanGate what="Events" />
      </Screen>
    )
  }
  const t = now()
  const over = isOver(event, t)
  const closed = !!event.cancelled || over

  async function toggle() {
    const r = await api.events.toggleInterest(event!.id)
    setError(r.ok ? null : r.error)
  }

  return (
    <Screen testID="event-detail" header={<TopBar back title="Event" />}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Badge label={kindLabel(event.kind)} tone="plain" />
        <Badge label={event.mode === 'online' ? 'Online' : 'In person'} tone="plain" />
        {isHappeningNow(event, t) ? <Badge tone="sun" label="Happening now" /> : null}
      </View>
      <Text variant="title">{event.title}</Text>
      {event.cancelled ? (
        <Banner testID="event-cancelled" tone="clay" icon="clock" title="This event was cancelled">
          {event.cancelled.reason}
        </Banner>
      ) : over ? (
        <Banner tone="sun" icon="clock" title="This event has finished" />
      ) : null}
      <View style={{ gap: 10 }}>
        <Row icon="cal" text={`${whenLabel(event.startsAt, t)} · ${event.durationMin} min`} />
        <Row icon={event.mode === 'online' ? 'video' : 'person'} text={event.place} />
        <Row icon="heart" text={`Hosted by ${event.host}`} />
      </View>
      <Text variant="body">{event.blurb}</Text>
      {!closed ? (
        <>
          <Pressable
            testID="event-interested"
            accessibilityRole="button"
            accessibilityState={{ selected: event.interestedByMe }}
            accessibilityLabel={event.interestedByMe ? 'You are interested. Tap to undo' : 'I’m interested'}
            onPress={toggle}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 26, backgroundColor: event.interestedByMe ? colors.moss : colors.lichen }}
          >
            <Icon name="heart" size={20} color={event.interestedByMe ? colors.white : colors.mossDeep} />
            <Text variant="label" color={event.interestedByMe ? colors.white : colors.mossDeep}>
              {event.interestedByMe ? 'You’re interested' : 'I’m interested'} · {event.interested}
            </Text>
          </Pressable>
          <Text variant="caption" muted>
            Tapping this tells Echo how many people want to come. Nobody sees your name, and you can change your mind any time.
          </Text>
          {error ? <Banner tone="clay">{error}</Banner> : null}
        </>
      ) : null}
    </Screen>
  )
}

function Row({ icon, text }: { icon: 'cal' | 'video' | 'person' | 'heart'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Icon name={icon} size={18} color={colors.mossDeep} />
      <Text variant="small" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  )
}
