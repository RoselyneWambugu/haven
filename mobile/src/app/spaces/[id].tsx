import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { PostCard } from '@/components/PostCard'
import { Banner, Card, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { spaceById } from '@/data/spaces'
import { go, goBack } from '@/lib/nav'
import { canRead, spaceFeed } from '@/lib/spaces'
import { useDb } from '@/store/db'

/** One support space: its welcome and rules, who looks after it, and its own feed. A sensitive space asks you to join before you can read it. */
export default function SpacePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const space = spaceById(id)
  const joined = useDb((s) => s.spaces)
  const posts = useDb((s) => s.posts)
  const hidden = useDb((s) => s.hiddenPostIds)
  const muted = useDb((s) => s.mutedAuthors)
  const forumOn = useDb((s) => s.content.flags.forum)
  const quickExit = useDb((s) => !!s.account?.settings.quickExit)
  const plan = usePlan()

  if (!space) {
    return (
      <Screen testID="space-gone" header={<TopBar back />}>
        <Text variant="title">This space isn’t here</Text>
        <Button label="Back to spaces" onPress={() => goBack('/spaces')} />
      </Screen>
    )
  }
  if (!plan) {
    return (
      <Screen testID="space-locked" header={<TopBar back title={space.name} />}>
        <Text variant="title">{space.name}</Text>
        <PlanGate what="Support spaces" />
      </Screen>
    )
  }
  const th = THERAPISTS.find((t) => t.id === space.facilitatorId)
  const member = joined.includes(space.id)
  const readable = canRead(space, joined)
  const feed = readable ? spaceFeed(posts, space.id, hidden, muted) : []

  return (
    <Screen
      testID="space"
      header={
        <TopBar
          back
          title={space.name}
          right={space.sensitive && quickExit ? <Button testID="space-quick-exit" size="sm" variant="quiet" label="Quick exit" onPress={() => api.auth.quickExit()} /> : undefined}
        />
      }
    >
      <Text variant="title">{space.name}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {th ? <Badge icon="check" label={`Led by ${th.name}`} /> : null}
        {space.sensitive ? <Badge icon="lock" label="Sensitive" tone="plain" /> : null}
      </View>
      <Text variant="body" muted>
        {space.blurb}
      </Text>

      {member ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {forumOn ? <Button testID="space-write" label="Write in this space" icon="pencil" onPress={() => go(`/forum/new?space=${space.id}`)} /> : null}
          <Button testID="space-leave" variant="ghost" label="Leave" onPress={() => api.spaces.leave(space.id)} />
        </View>
      ) : (
        <Button testID="space-join" label="Join this space" onPress={() => api.spaces.join(space.id)} />
      )}

      <Card tone="lichen" testID="space-welcome">
        <Text variant="h3">Before you read or write</Text>
        <Text variant="small" style={{ marginTop: 6 }}>
          {space.welcome}
        </Text>
        <View style={{ marginTop: 10, gap: 4 }}>
          {space.rules.map((r) => (
            <Text key={r} variant="small" muted>
              • {r}
            </Text>
          ))}
        </View>
        <Button testID="space-urgent" size="sm" variant="quiet" label="Urgent help" onPress={() => go('/urgent')} />
      </Card>

      {!readable ? (
        <Banner testID="space-gate" tone="sun" icon="lock" title="Join to read this space">
          This space is private to its members. Join to read and write. You can leave any time and nobody is told.
        </Banner>
      ) : feed.length ? (
        feed.map((p) => (
          <View key={p.id} style={{ gap: 6 }}>
            {th && p.authorKey === th.id ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Avatar kind="leaf" size={18} ring={false} />
                <Text variant="caption" muted>
                  From the therapist who leads this space
                </Text>
              </View>
            ) : null}
            <PostCard post={p} showTopic={false} />
          </View>
        ))
      ) : (
        <EmptyState icon="forum" title="Nothing here yet" body="Be the first to share something in this space." />
      )}
    </Screen>
  )
}
