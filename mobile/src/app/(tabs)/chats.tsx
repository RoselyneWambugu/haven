import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Count } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card, EmptyState, Row, SectionLabel } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { seatsLeft, status, whenLabel } from '@/lib/groupChat'
import { Badge } from '@/components/Controls'
import { useNow } from '@/store/useNow'
import { leftLabel, timeLeft } from '@/lib/chatLife'
import { go } from '@/lib/nav'
import { planState, canChat } from '@/lib/plan'
import { relative } from '@/lib/time'
import { useDb } from '@/store/db'
import type { Conversation } from '@/api'
import { colors } from '@/theme'

function preview(c: Conversation): string {
  const last = [...c.messages].reverse().find((m) => m.from !== 'system') ?? c.messages[c.messages.length - 1]
  if (!last) return 'Say hello'
  return (last.from === 'me' ? 'You: ' : '') + last.text
}

export default function Chats() {
  const conversations = useDb((s) => s.conversations)
  const sub = useDb((s) => s.subscription)
  const match = useDb((s) => s.match)
  const allSessions = useDb((s) => s.sessions)
  const groupChats = useDb((s) => s.groupChats)
  const clockNow = useNow(15_000)
  const [menu, setMenu] = useState<Conversation | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const readOnly = !canChat(planState(sub, now()))
  const sorted = [...conversations].sort((a, b) => b.lastAt - a.lastAt)
  const active = sorted.filter((c) => !c.archived)
  const therapists = active.filter((c) => c.kind === 'therapist')
  const peers = active.filter((c) => c.kind === 'peer')
  const archived = sorted.filter((c) => c.archived)

  const happening = groupChats.filter((g) => g.registered && ['lobby', 'open'].includes(status(g, clockNow)))
  const upcoming = groupChats.filter((g) => status(g, clockNow) === 'upcoming' || (!g.registered && status(g, clockNow) === 'lobby')).slice(0, 6)

  function groupCard(g: (typeof groupChats)[number]) {
    const st = status(g, clockNow)
    const th = THERAPISTS.find((t) => t.id === g.facilitatorId)
    return (
      <Card key={g.id} testID={`group-${g.id}`} onPress={() => go(`/group-chats/${g.id}`)} accessibilityLabel={`${g.topic}, ${whenLabel(g.startsAt, clockNow)}`} style={{ marginBottom: 10 }}>
        <Text variant="h3">{g.topic}</Text>
        <Text variant="small" muted style={{ marginTop: 2 }}>
          {st === 'open' ? 'Open now' : whenLabel(g.startsAt, clockNow)}
          {th ? ` · led by ${th.name}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {g.registered ? <Badge icon="check" label={st === 'open' ? 'Go in' : 'Signed up'} /> : null}
          <Badge label={seatsLeft(g) > 0 ? `${seatsLeft(g)} places left` : 'Full'} tone="plain" />
        </View>
      </Card>
    )
  }

  function line(c: Conversation) {
    const th = c.therapistId ? THERAPISTS.find((t) => t.id === c.therapistId) : null
    const name = c.peer?.penName ?? th?.name ?? 'Therapist'
    return (
      <Pressable
        key={c.id}
        testID={`chat-row-${c.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${name}${c.unread ? `, ${c.unread} new` : ''}. ${preview(c)}`}
        onPress={() => go(`/chat/${c.id}`)}
        onLongPress={() => setMenu(c)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.line }}
      >
        {c.peer ? <Avatar kind={c.peer.avatar} size={46} /> : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' }}><Icon name="heart" size={22} color={colors.mossDeep} /></View>}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </Text>
            {c.muted ? <Icon name="mute" size={14} color={colors.muted} /> : null}
            {c.ended ? <Text variant="caption" muted>Ended</Text> : null}
            {!c.ended ? <Text variant="caption" muted>· {leftLabel(timeLeft(c, allSessions, now()))} left</Text> : null}
          </View>
          <Text variant="small" muted numberOfLines={1} bold={c.unread > 0}>
            {preview(c)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text variant="caption" muted>
            {relative(c.lastAt, now())}
          </Text>
          {c.unread > 0 ? <Count n={c.unread} /> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`More for ${name}`} onPress={() => setMenu(c)} hitSlop={8} style={{ padding: 4 }}>
          <Icon name="dots" size={18} color={colors.muted} />
        </Pressable>
      </Pressable>
    )
  }

  return (
    <Screen tab testID="chats" header={<TopBar avatar />}>
      <Text variant="title">Chats</Text>
      {readOnly && conversations.length ? (
        <Banner tone="sun" icon="lock" title="Peer chats are read-only">
          Your plan has ended. You can still read your chats, and therapist chats stay open.
        </Banner>
      ) : null}
      {match.state === 'searching' ? (
        <Card tone="lichen" onPress={() => go('/match')} testID="chats-searching">
          <Text variant="label">Looking for someone…</Text>
          <Text variant="small" muted>
            We’ll tell you when you’re matched.
          </Text>
        </Card>
      ) : null}

      {happening.length ? (
        <View testID="groups-now">
          <SectionLabel>Happening now</SectionLabel>
          {happening.map(groupCard)}
        </View>
      ) : null}
      {therapists.length ? (
        <View>
          <SectionLabel>Therapists</SectionLabel>
          {therapists.map(line)}
        </View>
      ) : null}
      {peers.length ? (
        <View>
          <SectionLabel>Peers</SectionLabel>
          {peers.map(line)}
        </View>
      ) : null}
      <View testID="groups-upcoming">
        <SectionLabel>Upcoming group chats</SectionLabel>
        <Text variant="small" muted style={{ marginBottom: 8 }}>
          Timed chats on one topic, led by a verified therapist. Sign up and the room opens at the start time.
        </Text>
        {upcoming.length ? upcoming.map(groupCard) : <Text variant="small" muted>Nothing scheduled right now.</Text>}
      </View>
      {!active.length ? (
        <EmptyState icon="chats" title="No chats yet" body="Find someone who speaks your language and is in a similar age range, or book a therapist.">
          <Button testID="chats-find" label="Find someone to talk to" onPress={() => go('/match')} />
        </EmptyState>
      ) : (
        <Button testID="chats-find-more" variant="quiet" label="Find someone new" onPress={() => go('/match')} />
      )}
      {archived.length ? (
        <View>
          <Pressable accessibilityRole="button" onPress={() => setShowArchived((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="small" color={colors.mossDeep} bold>
              {showArchived ? 'Hide archived' : `Archived (${archived.length})`}
            </Text>
          </Pressable>
          {showArchived ? archived.map(line) : null}
        </View>
      ) : null}

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.peer?.penName ?? 'Chat'}>
        {menu ? (
          <View>
            <Row
              icon="mute"
              title={menu.muted ? 'Unmute' : 'Mute notifications'}
              onPress={() => {
                api.chat.setMuted(menu.id, !menu.muted)
                setMenu(null)
              }}
            />
            <Row
              icon="archive"
              title={menu.archived ? 'Move back to chats' : 'Archive'}
              last
              onPress={() => {
                api.chat.archive(menu.id, !menu.archived)
                setMenu(null)
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  )
}
