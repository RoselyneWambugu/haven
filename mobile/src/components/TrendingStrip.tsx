import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { Card } from './Surfaces'
import { Text } from './Text'
import type { ForumPost } from '@/api'
import { go } from '@/lib/nav'
import { isGossip } from '@/lib/gossip'
import { TRENDING_RULES, trendingReason } from '@/lib/trending'
import { colors } from '@/theme'

/** The posts people are reacting to this week, with the reason each is there and a plain explanation of the rule. */
export function TrendingStrip({ posts }: { posts: ForumPost[] }) {
  const [why, setWhy] = useState(false)
  if (!posts.length) return null
  return (
    <Card testID="trending" tone="lichen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="star" size={18} color={colors.mossDeep} />
        <Text variant="h3" style={{ flex: 1 }}>
          Trending this week
        </Text>
        <Pressable testID="trending-why" accessibilityRole="button" accessibilityLabel="How trending works" onPress={() => setWhy(true)} hitSlop={8}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            How it works
          </Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 6 }}>
        {posts.map((p, i) => (
          <Pressable
            key={p.id}
            testID={`trending-${p.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${p.title}. ${trendingReason(p)}`}
            onPress={() => go(`/forum/${p.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(24,88,68,0.18)' }}
          >
            <Text variant="h3" color={colors.mossDeep} style={{ width: 22 }}>
              {i + 1}
            </Text>
            <View style={{ flex: 1 }}>
              <Text variant="label" numberOfLines={2}>
                {p.title}
              </Text>
              <Text variant="caption" muted>
                {isGossip(p) ? 'Gossip · ' : `${p.topic} · `}
                {trendingReason(p)}
              </Text>
            </View>
            <Icon name="chevron" size={18} color={colors.mossDeep} />
          </Pressable>
        ))}
      </View>
      <Sheet visible={why} onClose={() => setWhy(false)} title="How trending works" testID="trending-sheet">
        {TRENDING_RULES.map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
            <Icon name="check" size={16} color={colors.mossDeep} />
            <Text variant="small" style={{ flex: 1 }}>
              {r}
            </Text>
          </View>
        ))}
      </Sheet>
    </Card>
  )
}
