import { View } from 'react-native'
import { Avatar } from './Art'
import { Badge } from './Controls'
import { Icon } from './Icon'
import { Card } from './Surfaces'
import { Text } from './Text'
import { now } from '@/lib/clock'
import { relative } from '@/lib/time'
import { go } from '@/lib/nav'
import type { ForumPost } from '@/api'
import { colors } from '@/theme'

/** One post in a list: author (pen name and avatar only), topic, a short preview, and counts. */
export function PostCard({ post }: { post: ForumPost }) {
  const therapistReplied = post.comments.some((c) => c.therapistId)
  return (
    <Card testID={`post-${post.id}`} onPress={() => go(`/forum/${post.id}`)} accessibilityLabel={`${post.title}, by ${post.authorName}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Avatar kind={post.authorAvatar} size={30} ring={false} />
        <Text variant="small" bold style={{ flexShrink: 1 }} numberOfLines={1}>
          {post.authorName}
        </Text>
        <Text variant="caption" muted>
          {relative(post.createdAt, now())}
        </Text>
        <View style={{ flex: 1 }} />
        <Badge label={post.topic} tone="plain" />
      </View>
      <Text variant="h3" style={{ marginTop: 10 }}>
        {post.title}
      </Text>
      <Text variant="small" muted numberOfLines={3} style={{ marginTop: 4 }}>
        {post.body}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="heart" size={16} color={post.supportedByMe ? colors.moss : colors.muted} />
          <Text variant="caption" muted>
            {post.supports}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="chats" size={16} color={colors.muted} />
          <Text variant="caption" muted>
            {post.comments.length}
          </Text>
        </View>
        {therapistReplied ? <Badge icon="check" label="Therapist replied" /> : null}
        {post.status === 'pending' ? <Badge tone="sun" label="In review" /> : null}
      </View>
    </Card>
  )
}
