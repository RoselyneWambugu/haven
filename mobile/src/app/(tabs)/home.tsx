import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Avatar, Face, type Mood } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { planState } from '@/lib/plan'
import { dayAndClock, eat } from '@/lib/time'
import { THERAPISTS } from '@/data/seed'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

const MOODS: { value: Mood; label: string }[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
]

function greeting(): string {
  const h = eat(now()).hour
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const account = useDb((s) => s.account)
  const sub = useDb((s) => s.subscription)
  const sessions = useDb((s) => s.sessions)
  const conversations = useDb((s) => s.conversations)
  const match = useDb((s) => s.match)
  const posts = useDb((s) => s.posts)

  const plan = planState(sub, now())
  const next = sessions.filter((x) => x.status === 'booked' && x.end > now()).sort((a, b) => a.start - b.start)[0]
  const therapist = next ? THERAPISTS.find((t) => t.id === next.therapistId) : null
  const live = conversations.filter((c) => !c.archived && !c.ended)
  const unread = live.reduce((n, c) => n + c.unread, 0)
  const highlight = posts.filter((p) => p.status === 'published' && !p.mine).sort((a, b) => b.supports - a.supports)[0]
  const mood = account?.mood && now() - account.mood.at < 24 * 3600_000 ? account.mood.value : null

  return (
    <Screen tab testID="home" header={<TopBar avatar />}>
      <View>
        <Text variant="title">
          {greeting()}, {account?.public.penName ?? ''}
        </Text>
        <Text variant="body" muted>
          How are you feeling today?
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="radiogroup">
        {MOODS.map((m) => (
          <Pressable
            key={m.value}
            testID={`mood-${m.value}`}
            accessibilityRole="radio"
            accessibilityLabel={m.label}
            accessibilityState={{ checked: mood === m.value }}
            onPress={() => api.auth.setMood(m.value)}
            style={{ alignItems: 'center', gap: 4, minWidth: 56 }}
          >
            <Face mood={m.value} selected={mood === m.value} />
            <Text variant="caption" muted>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {mood !== null && mood <= 2 ? (
        <Banner tone="green" icon="heart" title="That sounds hard">
          You don’t have to carry it alone. A therapist or a peer can listen, or you can get urgent help any time.
        </Banner>
      ) : null}

      {plan === 'none' || plan === 'lapsed' ? (
        <Card tone="fern" testID="home-plan-card">
          <Text variant="h3" color={colors.paper}>
            {plan === 'lapsed' ? 'Your plan has ended' : 'Start with a plan'}
          </Text>
          <Text variant="small" color={colors.lichen} style={{ marginTop: 4, marginBottom: 12 }}>
            {plan === 'lapsed' ? 'Your chats are read-only until you renew.' : 'A plan lets you chat with peers. Therapist sessions are booked and paid separately.'}
          </Text>
          <Button testID="home-see-plans" label={plan === 'lapsed' ? 'Renew' : 'See plans'} variant="light" onPress={() => go('/plans')} />
        </Card>
      ) : plan === 'ending' ? (
        <Banner tone="sun" icon="clock" title="Your plan ends soon">
          It won’t renew. Chats become read-only when it ends.
        </Banner>
      ) : null}

      {next && therapist ? (
        <Card onPress={() => go(`/sessions/${next.id}`)} testID="home-next-session" accessibilityLabel={`Next session with ${therapist.name}, ${dayAndClock(next.start)}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="cal" size={22} color={colors.mossDeep} />
            <View style={{ flex: 1 }}>
              <Text variant="small" muted>
                Next session
              </Text>
              <Text variant="h3">{therapist.name}</Text>
              <Text variant="small">{dayAndClock(next.start)}</Text>
            </View>
            <Badge label={next.mode === 'video' ? 'Video' : next.mode === 'voice' ? 'Voice' : 'Chat'} />
          </View>
        </Card>
      ) : null}

      <Card tone="lichen" testID="home-chats-card">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h3">Conversations</Text>
          {unread > 0 ? <Badge tone="sun" label={`${unread} new`} /> : null}
        </View>
        {live.length ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            {live.slice(0, 2).map((c) => {
              const th = c.therapistId ? THERAPISTS.find((t) => t.id === c.therapistId) : null
              return (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => go(`/chat/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                  {c.peer ? <Avatar kind={c.peer.avatar} size={36} /> : <Icon name="person" size={24} color={colors.mossDeep} />}
                  <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {c.peer?.penName ?? th?.name ?? 'Therapist'}
                  </Text>
                  {c.unread > 0 ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun }} /> : null}
                </Pressable>
              )
            })}
          </View>
        ) : (
          <Text variant="small" muted style={{ marginTop: 4 }}>
            No one yet. Echo can find someone who speaks your language and is in a similar age range.
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          {match.state === 'searching' ? (
            <Button testID="home-searching" label="Looking for someone…" variant="quiet" onPress={() => go('/match')} />
          ) : (
            <Button testID="find-someone" label={live.length ? 'Open chats' : 'Find someone to talk to'} onPress={() => (live.length ? go('/chats') : go('/match'))} />
          )}
        </View>
      </Card>

      {highlight ? (
        <Card onPress={() => go(`/forum/${highlight.id}`)} testID="home-forum-card" accessibilityLabel={`Community post: ${highlight.title}`}>
          <Text variant="small" muted>
            From the community
          </Text>
          <Text variant="h3" style={{ marginTop: 2 }}>
            {highlight.title}
          </Text>
          <Text variant="small" muted numberOfLines={2} style={{ marginTop: 4 }}>
            {highlight.body}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <Avatar kind={highlight.authorAvatar} size={26} ring={false} />
            <Text variant="caption" muted>
              {highlight.authorName} · {highlight.supports} supports · {highlight.comments.length} comments
            </Text>
          </View>
        </Card>
      ) : null}
    </Screen>
  )
}
