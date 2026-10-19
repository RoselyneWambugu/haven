import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ARTICLES, DEPARTMENTS } from '@/data/help'
import { go } from '@/lib/nav'
import { dayLong } from '@/lib/time'
import { colors } from '@/theme'

export default function Article() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const a = ARTICLES.find((x) => x.id === id)
  const [vote, setVote] = useState<'yes' | 'no' | null>(null)
  if (!a) return null
  const dept = DEPARTMENTS.find((d) => d.id === a.deptId)
  return (
    <Screen testID="help-article" header={<TopBar back title={dept?.title} />}>
      <Text variant="title">{a.title}</Text>
      <Text variant="body" muted>
        {a.intro}
      </Text>
      <View style={{ gap: 12 }}>
        {a.steps.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="small" bold color={colors.mossDeep}>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" style={{ flex: 1 }}>
              {s}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" muted>
        Updated {dayLong(a.updatedAt)}
      </Text>
      <Card tone="lichen">
        {vote ? (
          <View style={{ gap: 8 }}>
            <Text variant="label">{vote === 'yes' ? 'Thanks for telling us.' : 'Sorry it didn’t help.'}</Text>
            {vote === 'no' ? <Button variant="quiet" label="Contact support" onPress={() => go(`/help/contact?dept=${a.deptId}`)} /> : null}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text variant="label">Did this help?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button testID="helpful-yes" variant="light" label="Yes" onPress={() => setVote('yes')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button testID="helpful-no" variant="light" label="No" onPress={() => setVote('no')} />
              </View>
            </View>
          </View>
        )}
      </Card>
      {a.related.length ? (
        <View>
          <Text variant="h3">Related</Text>
          {a.related.map((rid, i) => {
            const r = ARTICLES.find((x) => x.id === rid)
            return r ? <Row key={rid} title={r.title} onPress={() => go(`/help/article/${rid}`)} last={i === a.related.length - 1} /> : null
          })}
        </View>
      ) : null}
      <Banner tone="green" icon="help">
        Still stuck? Our team replies in the app.
      </Banner>
    </Screen>
  )
}
