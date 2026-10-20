import { View } from 'react-native'
import { Badge } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { SPACES } from '@/data/spaces'
import { THERAPISTS } from '@/data/seed'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/** Support spaces: one group per issue. Each has a verified therapist who looks after it, its own rules, and its own feed. */
export default function Spaces() {
  const joined = useDb((s) => s.spaces)
  return (
    <Screen testID="spaces" header={<TopBar back title="Support spaces" />}>
      <Text variant="title">Support spaces</Text>
      <Text variant="body" muted>
        Groups for one issue each, so you can talk with people who understand. You are only ever a pen name and an avatar.
      </Text>
      <Banner tone="green" icon="shield">
        A verified therapist looks after every space. Sensitive ones are only visible to members who join, and every post in them is checked before it goes live.
      </Banner>
      {SPACES.map((s) => {
        const th = THERAPISTS.find((t) => t.id === s.facilitatorId)
        const on = joined.includes(s.id)
        return (
          <Card key={s.id} testID={`space-${s.id}`} onPress={() => go(`/spaces/${s.id}`)} accessibilityLabel={`${s.name}${on ? ', joined' : ''}`}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={22} color={colors.mossDeep} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="h3">{s.name}</Text>
                <Text variant="small" muted>
                  {s.blurb}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {on ? <Badge icon="check" label="Joined" /> : null}
                  {s.sensitive ? <Badge icon="lock" label="Sensitive" tone="plain" /> : null}
                  {th ? <Badge label={`Led by ${th.name}`} tone="plain" /> : null}
                </View>
              </View>
            </View>
          </Card>
        )
      })}
    </Screen>
  )
}
