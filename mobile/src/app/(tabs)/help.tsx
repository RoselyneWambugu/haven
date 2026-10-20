import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Card, EmptyState, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { visibleArticles } from '@/lib/content'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

export default function Help() {
  const [q, setQ] = useState('')
  const unread = useDb((s) => s.tickets.filter((t) => t.unread).length)
  const c = useDb((s) => s.content)
  const departments = c.departments.filter((d) => d.enabled)
  const articles = visibleArticles(c.articles, c.departments)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const results = terms.length ? articles.filter((x) => terms.every((t) => `${x.title} ${x.intro} ${x.steps.join(' ')}`.toLowerCase().includes(t))) : []
  const popular = c.popular.map((id) => articles.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x)
  const searching = q.trim().length > 0
  return (
    <Screen tab testID="help" header={<TopBar avatar />}>
      <Text variant="title">Help</Text>
      <Field testID="help-search" label="Search help" hideLabel placeholder="Search for an answer" value={q} onChangeText={setQ} />
      {searching ? (
        results.length ? (
          <View>
            {results.map((a, i) => (
              <Row key={a.id} testID={`result-${a.id}`} title={a.title} sub={a.intro} onPress={() => go(`/help/article/${a.id}`)} last={i === results.length - 1} />
            ))}
          </View>
        ) : (
          <EmptyState icon="search" title="No answers found" body="Try different words, or ask our team directly.">
            <Button label="Contact support" onPress={() => go('/help/contact')} />
          </EmptyState>
        )
      ) : (
        <>
          <Card tone="sun" onPress={() => go('/urgent')} testID="help-urgent" accessibilityLabel="Need urgent help? Free, open now">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="heart" size={24} color={colors.sunInk} />
              <View style={{ flex: 1 }}>
                <Text variant="h3" color={colors.sunInk}>
                  Need urgent help?
                </Text>
                <Text variant="small" color={colors.sunInk}>
                  Free and open now. No login needed.
                </Text>
              </View>
              <Icon name="chevron" size={18} color={colors.sunInk} />
            </View>
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {departments.map((d) => (
              <Pressable
                key={d.id}
                testID={`dept-${d.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${d.title}. ${d.blurb}`}
                onPress={() => go(`/help/dept/${d.id}`)}
                style={{ width: '48%', backgroundColor: colors.milk, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8, minHeight: 112 }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={d.icon} size={20} color={colors.mossDeep} />
                </View>
                <Text variant="label">{d.title}</Text>
                <Text variant="caption" muted>
                  {d.blurb}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text variant="h3">Popular</Text>
          <View>
            {popular.map((a, i) => (
              <Row key={a.id} title={a.title} onPress={() => go(`/help/article/${a.id}`)} last={i === popular.length - 1} />
            ))}
          </View>
          <Button testID="help-contact" variant="quiet" label="Contact support" icon="ticket" onPress={() => go('/help/contact')} />
          <Button testID="help-tickets" variant="ghost" label={unread ? `My tickets (${unread} new)` : 'My tickets'} onPress={() => go('/help/tickets')} />
          <Button variant="ghost" label="Support organisations" onPress={() => go('/help/orgs')} />
        </>
      )}
    </Screen>
  )
}
