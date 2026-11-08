import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { EventCard } from '@/components/EventCard'
import { PostCard } from '@/components/PostCard'
import { Banner, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { go } from '@/lib/nav'
import { generalPosts } from '@/lib/spaces'
import { gossipFeed, GOSSIP_RULES } from '@/lib/gossip'
import { upcomingEvents } from '@/lib/events'
import { pollFeed } from '@/lib/polls'
import { isSearching, resultCount, searchCommunity, SEARCH, trendingPosts } from '@/lib/trending'
import { TrendingStrip } from '@/components/TrendingStrip'
import { Field } from '@/components/Field'
import { SearchFilter } from '@/components/SearchFilter'
import { Icon } from '@/components/Icon'
import { PollCard } from '@/components/PollCard'
import { now } from '@/lib/clock'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

export default function Forum() {
  const plan = usePlan()
  const posts = useDb((s) => s.posts)
  const TOPICS = useDb((s) => s.content.topics)
  const forumOn = useDb((s) => s.content.flags.forum)
  const hidden = useDb((s) => s.hiddenPostIds)
  const muted = useDb((s) => s.mutedAuthors)
  const [topic, setTopic] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'support'>('new')
  const [view, setView] = useState<'feed' | 'gossip' | 'events' | 'polls'>('feed')
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const visible = generalPosts(posts)
    .filter((p) => p.status !== 'hidden' && !hidden.includes(p.id) && !muted.includes(p.authorKey))
    .filter((p) => p.status === 'published' || p.mine)
    .filter((p) => !topic || p.topic === topic)
    .sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : b.supports - a.supports))

  const gossip = gossipFeed(posts, hidden, muted)
  const polls = pollFeed(posts, hidden, muted)
  const events = useDb((s) => s.events)
  const upcoming = upcomingEvents(events, now())
  const trending = trendingPosts(posts, now(), hidden, muted)
  const found = isSearching(query) ? searchCommunity(query, { posts, events, hidden, muted }, now()) : null

  return (
    <Screen tab testID="forum" header={<TopBar avatar />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Community</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {plan ? (
          <Pressable testID="search-toggle" accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : 'Search the community'} onPress={() => { setSearching((x) => !x); setQuery('') }} hitSlop={8} style={{ padding: 8 }}>
            <Icon name={searching ? 'close' : 'search'} size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        {forumOn && plan && view !== 'events' ? (
          view === 'polls' ? (
            <Button testID="poll-new" label="Ask a poll" size="sm" icon="pencil" onPress={() => go('/polls/new')} />
          ) : view === 'gossip' ? (
            <Button testID="gossip-new" label="Share gossip" size="sm" icon="pencil" onPress={() => go('/gossip/new')} />
          ) : (
            <Button testID="forum-new" label="Write a post" size="sm" icon="pencil" onPress={() => go('/forum/new')} />
          )
        ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip testID="view-feed" label="Feed" selected={view === 'feed'} onPress={() => setView('feed')} />
        <Chip testID="view-gossip" label="Gossip" selected={view === 'gossip'} onPress={() => setView('gossip')} />
        <Chip testID="view-polls" label="Polls" selected={view === 'polls'} onPress={() => setView('polls')} />
        <Chip testID="view-events" label="Events" selected={view === 'events'} onPress={() => setView('events')} />
        <Chip testID="open-spaces" label="Support spaces" onPress={() => go('/spaces')} />
      </View>
      {plan && searching ? (
        <View style={{ gap: 12 }}>
          <Field testID="community-search" label="Search the community" hideLabel placeholder="Search posts, gossip, polls and events" value={query} onChangeText={(v) => setQuery(v.slice(0, SEARCH.maxChars))} autoFocus returnKeyType="search" />
          {!found ? (
            <Text variant="small" muted>
              Type at least {SEARCH.minChars} letters. Searching happens on your phone, over what you can already see here, and nothing you type is sent anywhere.
            </Text>
          ) : resultCount(found) === 0 ? (
            <EmptyState icon="search" title="Nothing found" body={`No posts, gossip, polls or events match “${query.trim()}”. Try fewer or different words.`} />
          ) : (
            <View testID="search-results" style={{ gap: 12 }}>
              {found.posts.length ? <Text variant="h3">Community posts</Text> : null}
              {found.posts.map((p) => <PostCard key={p.id} post={p} />)}
              {found.gossip.length ? <Text variant="h3">Gossip</Text> : null}
              {found.gossip.map((p) => <PostCard key={p.id} post={p} showTopic={false} />)}
              {found.polls.length ? <Text variant="h3">Polls</Text> : null}
              {found.polls.map((p) => <PollCard key={p.id} post={p} />)}
              {found.events.length ? <Text variant="h3">Events</Text> : null}
              {found.events.map((e) => <EventCard key={e.id} event={e} />)}
            </View>
          )}
        </View>
      ) : null}
      {!plan ? <PlanGate what="The community, support spaces and group chats" /> : null}
      {!forumOn ? (
        <Banner tone="sun" icon="clock" title="Posting is paused">
          You can still read the community. We’ll turn posting back on soon.
        </Banner>
      ) : null}
      {plan && !found && view === 'polls' ? (
        <>
          <Text variant="small" muted>
            Quick questions from the community. Vote once, then see how others answered. Nobody sees who voted.
          </Text>
          {polls.length ? (
            polls.map((p) => <PollCard key={p.id} post={p} />)
          ) : (
            <EmptyState icon="forum" title="No polls yet" body="Ask the first one: two to four answers, and everyone gets one vote.">
              {forumOn ? <Button label="Ask a poll" onPress={() => go('/polls/new')} /> : null}
            </EmptyState>
          )}
        </>
      ) : null}
      {plan && !found && view === 'events' ? (
        <>
          <Text variant="small" muted>
            Webinars, workshops and walks Echo puts on. Tap an event and say you are interested, so Echo knows how many people want to come.
          </Text>
          {upcoming.length ? (
            upcoming.map((e) => <EventCard key={e.id} event={e} />)
          ) : (
            <EmptyState icon="forum" title="No events planned yet" body="When Echo schedules a webinar, workshop or walk, it will show up here." />
          )}
        </>
      ) : null}
      {plan && !found && view === 'gossip' ? (
        <>
          <Banner testID="gossip-rules" tone="green" icon="shield" title="The latest talk, kept kind">
            {GOSSIP_RULES.join(' ')}
          </Banner>
          {gossip.length ? (
            gossip.map((p) => <PostCard key={p.id} post={p} showTopic={false} />)
          ) : (
            <EmptyState icon="forum" title="No gossip yet" body="Be the first to share what people are talking about.">
              {forumOn ? <Button label="Share gossip" onPress={() => go('/gossip/new')} /> : null}
            </EmptyState>
          )}
        </>
      ) : null}
      {plan && !found && view === 'feed' ? (
      <>
      <Text variant="small" muted>
        Posts use pen names. Therapists join in with general information, not treatment.
      </Text>
      {!topic ? <TrendingStrip posts={trending} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchFilter
            testID="feed"
            resultLabel={`Show ${visible.length} post${visible.length === 1 ? '' : 's'}`}
            groups={[
              { key: 'sort', title: 'Sort by', options: [{ value: 'new', label: 'Newest' }, { value: 'support', label: 'Most supported' }], value: sort, defaultValue: 'new', onChange: (v) => setSort((v ?? 'new') as 'new' | 'support') },
              { key: 'topic', title: 'Topic', options: TOPICS.map((x) => ({ value: x, label: x })), value: topic, defaultValue: null, onChange: (v) => setTopic(v as string | null) },
            ]}
          />
        </View>
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
