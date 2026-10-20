import { useState } from 'react'
import { Animated, Linking, View } from 'react-native'
import { Button } from '@/components/Button'
import { useBreath } from '@/components/Art'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { verification } from '@/lib/content'
import { dayLong } from '@/lib/time'
import { now } from '@/lib/clock'
import { useDb } from '@/store/db'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

/**
 * Urgent help. Reachable from every screen, signed in or not, and free (PRD CRS-1 to CRS-5).
 * The numbers are placeholders until the clinical team verifies them (D29), and the screen says so.
 */
export default function Urgent() {
  const c = useDb((s) => s.content)
  const EMERGENCY = c.emergency
  const v = verification(c.crisisVerifiedAt, now())
  const [breathing, setBreathing] = useState(false)
  const breath = useBreath()
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] })
  const dial = (phone: string) => Linking.openURL(`tel:${phone}`)
  return (
    <Screen testID="urgent" header={<TopBar back urgent={false} />}>
      <Text variant="title">You’re not alone</Text>
      <Text variant="body" muted>
        If you’re in danger or thinking about ending your life, please talk to someone now. These services are free.
      </Text>
      <Card tone="clay">
        <Text variant="h3">Immediate danger</Text>
        <Text variant="small" style={{ marginTop: 4, marginBottom: 12 }}>
          {EMERGENCY.name} · {EMERGENCY.hours}
        </Text>
        <Button testID="call-emergency" variant="urgent" label={`Call ${EMERGENCY.phone}`} icon="phone" onPress={() => dial(EMERGENCY.phone)} />
      </Card>
      {c.crisisLines.map((l) => (
        <Card key={l.name}>
          <Text variant="h3">{l.name}</Text>
          <Text variant="small" muted>
            {l.hours} · {l.languages}
          </Text>
          <View style={{ marginTop: 10 }}>
            <Button variant="quiet" disabled={!l.phone} label={l.phone ? `Call ${l.phone}` : 'Number to be confirmed'} icon="phone" onPress={() => dial(l.phone)} />
          </View>
        </Card>
      ))}
      {v.state === 'never' ? (
        <Banner tone="sun" icon="clock" title="Numbers not final">
          Helpline details are placeholders until our clinical team has checked them. Use 112 in an emergency.
        </Banner>
      ) : (
        <Text variant="caption" muted>
          Numbers last checked by our clinical team on {dayLong(c.crisisVerifiedAt!)}.{v.state === 'stale' ? ' They are due another check.' : ''}
        </Text>
      )}
      <Card tone="lichen">
        <Text variant="h3">Take a moment</Text>
        {breathing ? (
          <View style={{ alignItems: 'center', gap: 14, paddingVertical: 12 }}>
            <Animated.View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.moss, transform: [{ scale }] }} />
            <Text variant="body" align="center">
              Breathe in slowly as the circle grows, and out as it shrinks.
            </Text>
            <Button variant="ghost" label="Stop" onPress={() => setBreathing(false)} />
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 8 }}>
            <Text variant="small">A slow breathing exercise can help the next few minutes feel more manageable.</Text>
            <Button testID="breathe" variant="light" label="Start breathing exercise" onPress={() => setBreathing(true)} />
          </View>
        )}
      </Card>
      <Button variant="ghost" label="More support organisations" onPress={() => go('/help/orgs')} />
    </Screen>
  )
}
