import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ageBand, ageBandLabel, ageOn } from '@/lib/identity'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { getDb, useDb } from '@/store/db'
import { colors } from '@/theme'

/** Languages decide matching, so they are required. Topics are optional and never used to match people (D17). */
export default function Languages() {
  const reg = getDb().reg
  const TOPICS = useDb((s) => s.content.topics)
  const languages = useDb((s) => s.content.languages)
  const [langs, setLangs] = useState<string[]>(reg?.languages ?? ['English'])
  const [topics, setTopics] = useState<string[]>(reg?.topics ?? [])
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const band = reg?.dob ? ageBand(ageOn(new Date(reg.dob), new Date(now()))) : null

  function next() {
    api.auth.saveProfileDraft({ languages: langs, topics })
    go('/consent')
  }

  return (
    <Screen testID="languages" header={<TopBar back />} footer={<Button testID="languages-continue" label="Continue" disabled={!langs.length} onPress={next} />}>
      <Text variant="caption" muted>
        Step 4 of 5
      </Text>
      <Text variant="title">Languages and interests</Text>
      <Text variant="small" muted>
        Languages you speak. We match you with people who share at least one.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {languages.map((l) => (
          <Chip key={l} testID={`lang-${l}`} label={l} selected={langs.includes(l)} onPress={() => setLangs((x) => toggle(x, l))} />
        ))}
      </View>
      <Text variant="small" muted style={{ marginTop: 6 }}>
        Community topics you care about (optional).
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TOPICS.map((tp) => (
          <Chip key={tp} label={tp} selected={topics.includes(tp)} onPress={() => setTopics((x) => toggle(x, tp))} />
        ))}
      </View>
      <Text variant="small" muted style={{ marginTop: 6 }}>
        What others will see
      </Text>
      <Card tone="lichen">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar kind={reg?.avatar ?? 'moon'} size={48} />
          <View>
            <Text variant="h3">{reg?.penName ?? ''}</Text>
            <Text variant="small" color={colors.mossDeep}>
              {band ? `${ageBandLabel(band)}, ` : ''}
              {langs.join(', ') || 'No language chosen'}
            </Text>
          </View>
        </View>
      </Card>
      <Text variant="caption" muted>
        Your real name, phone and ID are never shown. You can change your pen name later, with limits.
      </Text>
    </Screen>
  )
}
