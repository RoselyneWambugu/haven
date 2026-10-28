import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { PostCard } from '@/components/PostCard'
import { Banner, Card, EmptyState } from '@/components/Surfaces'
import { Icon } from '@/components/Icon'
import { colors } from '@/theme'
import { Text } from '@/components/Text'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { go } from '@/lib/nav'
import { generalPosts } from '@/lib/spaces'
import { useDb } from '@/store/db'

export default function Forum() {
  const plan = usePlan()
  const posts = useDb((s) => s.posts)
  const TOPICS = useDb((s) => s.content.topics)
  const forumOn = useDb((s) => s.content.flags.forum)
  const hidden = useDb((s) => s.hiddenPostIds)
  const muted = useDb((s) => s.mutedAuthors)
  const [topic, setTopic] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'support'>('new')

  const visible = generalPosts(posts)
    .filter((p) => p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey))
    .filter((p) => p.status === 'published' || p.mine)
    .filter((p) => !topic || p.topic === topic)
    .sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : b.supports - a.supports))

  return (
    <Screen tab testID="forum" header={<TopBar avatar />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Community</Text>
        {forumOn && plan ? <Button testID="forum-new" label="Write a post" size="sm" icon="pencil" onPress={() => go('/forum/new')} /> : null}
      </View>
      {!plan ? <PlanGate what="The community, support spaces and group chats" /> : null}
      {!forumOn ? (
        <Banner tone="sun" icon="clock" title="Posting is paused">
          You can still read the community. We’ll turn posting back on soon.
        </Banner>
      ) : null}
      {plan ? (
      <>
      <Text variant="small" muted>
        Posts use pen names. Therapists join in with general information, not treatment.
      </Text>
      <Card testID="open-spaces" tone="lichen" onPress={() => go('/spaces')} accessibilityLabel="Support spaces">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="h3">Support spaces</Text>
            <Text variant="small" muted>
              Groups for domestic violence, PTSD, grief, anxiety and more. A therapist looks after each one.
            </Text>
          </View>
          <Icon name="chevron" size={20} color={colors.mossDeep} />
        </View>
      </Card>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        <Chip label="All" selected={!topic} onPress={() => setTopic(null)} />
        {TOPICS.map((t) => (
          <Chip key={t} testID={`topic-${t}`} label={t} selected={topic === t} onPress={() => setTopic(topic === t ? null : t)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Newest" selected={sort === 'new'} onPress={() => setSort('new')} />
        <Chip label="Most supported" selected={sort === 'support'} onPress={() => setSort('support')} />
        <View style={{ flex: 1 }} />
        <Chip label="My posts" icon="person" onPress={() => go('/forum/mine')} />
      </View>
      {visible.length ? (
        visible.map((p) => <PostCard key={p.id} post={p} />)
      ) : (
        <EmptyState icon="forum" title="Nothing here yet" body={topic ? `No posts about ${topic} right now.` : 'Be the first to share something.'}>
          {forumOn ? <Button label="Write a post" onPress={() => go('/forum/new')} /> : null}
        </EmptyState>
      )}
      </>
      ) : null}
    </Screen>
  )
}
