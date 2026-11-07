import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { PersonTap } from './PersonCard'
import { Avatar } from './Art'
import { Badge } from './Controls'
import { Icon } from './Icon'
import { Banner, Card } from './Surfaces'
import { Text } from './Text'
import type { ForumPost } from '@/api'
import { now } from '@/lib/clock'
import { closesIn, pollOpen, shares, showResults, totalVotes } from '@/lib/polls'
import { go } from '@/lib/nav'
import { relative } from '@/lib/time'
import { colors } from '@/theme'

/**
 * A poll: the question, and the answers to tap. Before voting no counts are shown, so they can't sway anyone; after voting each answer
 * shows its share. Tapping the question opens the post, where a poll can be reported.
 */
export function PollCard({ post, open = true }: { post: ForumPost; open?: boolean }) {
  const poll = post.poll
  const [error, setError] = useState<string | null>(null)
  if (!poll) return null
  const t = now()
  const live = pollOpen(poll, t)
  const results = showResults(post, poll, t)
  const pct = shares(poll)
  const canVote = live && poll.myVote === null && post.status === 'published'

  async function vote(i: number) {
    const r = await api.forum.vote(post.id, i)
    setError(r.ok ? null : r.error)
  }

  return (
    <Card testID={`poll-${post.id}`} accessibilityLabel={`Poll: ${post.title}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PersonTap name={post.authorName} avatar={post.authorAvatar} authorKey={post.authorKey}>
          <Avatar kind={post.authorAvatar} size={30} ring={false} />
          <Text variant="small" bold style={{ flexShrink: 1 }} numberOfLines={1}>
            {post.authorName}
          </Text>
        </PersonTap>
        <Text variant="caption" muted>
          {relative(post.createdAt, t)}
        </Text>
        <View style={{ flex: 1 }} />
        {post.status === 'pending' ? <Badge tone="sun" label="In review" /> : null}
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={`${post.title}. Open`} onPress={() => open && go(`/forum/${post.id}`)} style={{ marginTop: 10 }}>
        <Text variant="h3">{post.title}</Text>
      </Pressable>
      <View style={{ gap: 8, marginTop: 12 }}>
        {poll.options.map((o, i) => {
          const mine = poll.myVote === i
          return (
            <Pressable
              key={i}
              testID={`poll-${post.id}-option-${i}`}
              accessibilityRole="button"
              accessibilityState={{ selected: mine, disabled: !canVote }}
              accessibilityLabel={results ? `${o.text}, ${pct[i]} percent${mine ? ', your answer' : ''}` : o.text}
              disabled={!canVote}
              onPress={() => vote(i)}
              style={{ minHeight: 46, borderRadius: 14, borderWidth: 1.5, borderColor: mine ? colors.moss : colors.line, backgroundColor: colors.paper, overflow: 'hidden', justifyContent: 'center' }}
            >
              {results ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct[i]}%`, backgroundColor: mine ? colors.lichen : '#EDE5D2' }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
                {mine ? <Icon name="check" size={16} color={colors.moss} /> : null}
                <Text variant="small" style={{ flex: 1 }} bold={mine}>
                  {o.text}
                </Text>
                {results ? (
                  <Text variant="caption" muted>
                    {pct[i]}%
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )
        })}
      </View>
      {error ? (
        <View style={{ marginTop: 8 }}>
          <Banner tone="clay">{error}</Banner>
        </View>
      ) : null}
      <Text variant="caption" muted style={{ marginTop: 10 }}>
        {results ? `${totalVotes(poll)} ${totalVotes(poll) === 1 ? 'vote' : 'votes'} · ` : canVote ? 'Vote to see how others answered · ' : ''}
        {closesIn(poll, t)}
      </Text>
    </Card>
  )
}
