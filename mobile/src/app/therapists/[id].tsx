import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Portrait } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { nextAvailableLabel } from '@/lib/booking'
import { now } from '@/lib/clock'
import { slotsFor } from '@/lib/directory'
import { modesFor } from '@/lib/content'
import { go } from '@/lib/nav'
import { liveStars, ratingLabel, summarise } from '@/lib/ratings'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

/** A therapist's public profile: verified licence, specialisations, languages, session types and price. */
export default function TherapistProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = THERAPISTS.find((x) => x.id === id)
  const sessions = useDb((s) => s.sessions)
  const money = useMoney()
  const flags = useDb((s) => s.content.flags)
  if (!t) {
    return (
      <Screen header={<TopBar back />} testID="therapist-gone">
        <Text variant="title">Therapist not found</Text>
      </Screen>
    )
  }
  const slots = slotsFor(t, sessions, now())
  return (
    <Screen
      testID="therapist-profile"
      header={<TopBar back />}
      footer={<Button testID="book" label={t.acceptingNew ? 'Book a session' : 'Not taking new clients'} disabled={!t.acceptingNew} onPress={() => go(`/book/${t.id}`)} />}
    >
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Portrait tone={t.tone} width={92} height={110} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title">{t.name}</Text>
          <Text variant="body" muted>
            {t.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="star" size={15} color={colors.sun} />
            <Text variant="small">
              {ratingLabel(summarise(t, liveStars(sessions, t.id)))}
            </Text>
          </View>
        </View>
      </View>
      <Banner tone="green" icon="shield" title="Licence checked">
        {t.licenceBody}, no. {t.licenceNumber}. Valid to {dayLong(t.licenceValidTo)}.
      </Banner>
      <Text variant="body">{t.bio}</Text>
      <Card>
        <Text variant="label">Helps with</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {t.specialisations.map((s) => (
            <Badge key={s} label={s} />
          ))}
        </View>
        <Text variant="label" style={{ marginTop: 14 }}>
          Languages
        </Text>
        <Text variant="small" muted>
          {t.languages.join(', ')}
        </Text>
        <Text variant="label" style={{ marginTop: 14 }}>
          Session types
        </Text>
        <Text variant="small" muted>
          {modesFor(t.modes, flags).map((m) => m[0].toUpperCase() + m.slice(1)).join(', ')} · 45 minutes
        </Text>
        <Text variant="label" style={{ marginTop: 14 }}>
          Price
        </Text>
        <Text variant="small" muted>
          {money(t.priceKes)} per session
        </Text>
      </Card>
      <Text variant="small" bold color={slots.length ? colors.mossDeep : colors.muted}>
        {nextAvailableLabel(slots, now()) ?? 'No times in the next 2 weeks'}
      </Text>
      <Text variant="caption" muted>
        Free changes up to 24 hours before. Therapists are not an emergency service. For urgent help, tap “Urgent help”.
      </Text>
    </Screen>
  )
}
