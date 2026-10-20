import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { PostCard } from '@/components/PostCard'
import { Banner, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

export default function Forum() {
  const posts = useDb((s) => s.posts)
  const TOPICS = useDb((s) => s.content.topics)
  const forumOn = useDb((s) => s.content.flags.forum)
  const hidden = useDb((s) => s.hiddenPostIds)
  const muted = useDb((s) => s.mutedAuthors)
  const [topic, setTopic] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'support'>('new')

  const visible = posts
    .filter((p) => p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey))
    .filter((p) => p.status === 'published' || p.mine)
    .filter((p) => !topic || p.topic === topic)
    .sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : b.supports - a.supports))

  return (
    <Screen tab testID="forum" header={<TopBar avatar />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Community</Text>
        {forumOn ? <Button testID="forum-new" label="Write a post" size="sm" icon="pencil" onPress={() => go('/forum/new')} /> : null}
      </View>
      {!forumOn ? (
        <Banner tone="sun" icon="clock" title="Posting is paused">
          You can still read the community. We’ll turn posting back on soon.
        </Banner>
      ) : null}
      <Text variant="small" muted>
        Posts use pen names. Therapists join in with general information, not treatment.
      </Text>
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
    </Screen>
  )
}
