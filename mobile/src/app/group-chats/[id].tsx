import { useEffect, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge, Check } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { GROUP_TEMPLATES } from '@/data/groupChats'
import { THERAPISTS } from '@/data/seed'
import { leftLabel } from '@/lib/chatLife'
import { canRegister, deletesAt, endsAt, seatsLeft, status, whenLabel } from '@/lib/groupChat'
import { goBack } from '@/lib/nav'
import { detectBlockedContent, detectDistress, explainBlock } from '@/lib/safety'
import { clock } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import type { GroupMessage, ReportReason } from '@/api'
import { colors, MAX_WIDTH } from '@/theme'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'threats', label: 'Threats' },
  { value: 'sexual', label: 'Sexual or unwanted content' },
  { value: 'scam', label: 'Scam or asking for money' },
  { value: 'self-harm', label: 'Encouraging self-harm' },
  { value: 'other', label: 'Something else' },
]

/** A timed group chat: sign up before it starts, the room opens at the set time, and it ends after its length. */
export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const g = useDb((s) => s.groupChats.find((x) => x.id === id))
  const t = useNow(5_000)
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reporting, setReporting] = useState<GroupMessage | null>(null)
  const [reason, setReason] = useState<ReportReason>('harassment')
  const list = useRef<FlatList<GroupMessage>>(null)

  useEffect(() => {
    const timer = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(timer)
  }, [g?.messages.length])

  if (!g) {
    return (
      <Screen testID="group-gone" header={<TopBar back />}>
        <Text variant="title">This group chat isn’t here</Text>
        <Button label="Back to chats" onPress={() => goBack('/chats')} />
      </Screen>
    )
  }
  const th = THERAPISTS.find((x) => x.id === g.facilitatorId)
  const tpl = GROUP_TEMPLATES.find((x) => g.id.startsWith(`gc-${x.key}-`))
  const st = status(g, t)
  const room = g.registered && (st === 'lobby' || st === 'open' || st === 'ended')
  const draftBlock = detectBlockedContent(text)
  const distress = detectDistress(text).level

  if (!room) {
    return (
      <Screen testID="group-detail" header={<TopBar back title="Group chat" />}>
        <Text variant="title">{g.topic}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Badge icon="clock" label={whenLabel(g.startsAt, t)} />
          <Badge label={`${g.durationMin} min`} tone="plain" />
          {th ? <Badge icon="check" label={`Led by ${th.name}`} tone="plain" /> : null}
        </View>
        <Text variant="body" muted>
          {g.blurb}
        </Text>
        {st === 'cancelled' ? (
          <Banner testID="group-cancelled" tone="sun" icon="clock" title="This group chat was cancelled">
            We’re sorry. There will be another soon, and you’ll find it under Chats.
          </Banner>
        ) : st === 'ended' ? (
          <Banner testID="group-ended" tone="sun" icon="clock" title="This group chat has ended">
            It was deleted or will be 24 hours after it ended.
          </Banner>
        ) : (
          <>
            <Text testID="group-seats" variant="small" muted>
              {seatsLeft(g) > 0 ? `${seatsLeft(g)} of ${g.capacity} places left` : 'This group chat is full'}
            </Text>
            {g.registered ? (
              <>
                <Banner tone="green" icon="check" title="You’re signed up">
                  The room opens {st === 'lobby' ? 'in a few minutes' : whenLabel(g.startsAt, t)}. We’ll remind you an hour and ten minutes before.
                </Banner>
                <Button testID="group-unregister" variant="ghost" label="Give up my place" onPress={() => api.groups.unregister(g.id)} />
              </>
            ) : (
              <Button testID="group-register" label="Sign up" disabled={!canRegister(g, t)} onPress={() => { const r = api.groups.register(g.id); setError(r.ok ? null : r.error) }} />
            )}
            {error ? <Banner tone="clay">{error}</Banner> : null}
          </>
        )}
        <Card tone="lichen">
          <Text variant="h3">How it works</Text>
          <View style={{ marginTop: 8, gap: 4 }}>
            {(tpl?.rules ?? []).map((r) => (
              <Text key={r} variant="small" muted>
                • {r}
              </Text>
            ))}
          </View>
        </Card>
      </Screen>
    )
  }

  function send() {
    const r = api.groups.send(g!.id, text)
    if (!r.ok) {
      if (r.code !== 'empty') setError(r.error)
      return
    }
    setText('')
    setError(null)
  }

  const open = st === 'open'
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="group-room">
      <View style={{ paddingTop: insets.top, paddingHorizontal: 18 }}>
        <TopBar back urgent />
        <View style={{ paddingBottom: 10 }}>
          <Text variant="h3" numberOfLines={2}>
            {g.topic}
          </Text>
          <Text testID="group-status" variant="caption" muted>
            {st === 'lobby' ? `Starts ${clock(g.startsAt)} EAT. You can go in early.` : open ? `Open now, ${leftLabel(endsAt(g) - t)} left` : `Ended. Deleted in ${leftLabel(deletesAt(g) - t)}`}
          </Text>
        </View>
      </View>
      <FlatList
        ref={list}
        data={g.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 10, gap: 10, maxWidth: MAX_WIDTH }}
        ListHeaderComponent={
          <Banner tone="green" icon="shield">
            {th ? `${th.name} leads this room. ` : ''}No links, phone numbers or addresses. Hold a message to report it.
          </Banner>
        }
        ListEmptyComponent={
          <Text variant="small" muted align="center" style={{ paddingVertical: 20 }}>
            {st === 'lobby' ? 'The facilitator will welcome everyone when it starts.' : 'Nothing yet.'}
          </Text>
        }
        renderItem={({ item }) =>
          item.system ? (
            <Text variant="caption" muted align="center" style={{ paddingVertical: 6 }}>
              {item.text}
            </Text>
          ) : (
            <Pressable
              testID={`gm-${item.id}`}
              accessibilityLabel={`${item.name}: ${item.text}`}
              onLongPress={() => !item.mine && setReporting(item)}
              style={{ flexDirection: item.mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}
            >
              <Avatar kind={item.avatar} size={28} ring={false} />
              <View style={{ maxWidth: '78%' }}>
                <Text variant="caption" muted align={item.mine ? 'right' : 'left'}>
                  {item.name}
                  {item.facilitator ? ' · leads the room' : ''} · {clock(item.at)}
                </Text>
                <View style={{ backgroundColor: item.mine ? colors.moss : item.facilitator ? colors.lichen : colors.milk, borderWidth: item.mine || item.facilitator ? 0 : 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 }}>
                  <Text variant="body" color={item.mine ? colors.white : colors.ink}>
                    {item.text}
                  </Text>
                </View>
              </View>
              {!item.mine ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Report this message" onPress={() => setReporting(item)} hitSlop={8} style={{ padding: 4 }}>
                  <Icon name="flag" size={14} color={colors.muted} />
                </Pressable>
              ) : null}
            </Pressable>
          )
        }
      />
      {open ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper }}>
          {distress !== 'none' ? (
            <Banner tone="sun" icon="heart" title="It sounds like things are heavy">
              Urgent help is free and open now. Tap “Urgent help” at the top any time.
            </Banner>
          ) : null}
          {draftBlock.blocked ? (
            <Banner tone="clay" icon="shield" title="This message can’t be sent yet">
              {explainBlock(draftBlock.reasons)}
            </Banner>
          ) : error ? (
            <Banner tone="clay">{error}</Banner>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              testID="group-input"
              value={text}
              onChangeText={(v) => { setText(v); setError(null) }}
              placeholder="Write to the group"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Message to the group"
              multiline
              maxLength={500}
              style={{ flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.milk, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, color: colors.ink, fontSize: 16 }}
            />
            <Pressable testID="group-send" accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || draftBlock.blocked} onPress={send} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() && !draftBlock.blocked ? colors.moss : colors.lichenDeep, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="send" size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 14), paddingTop: 8 }}>
          <Banner tone="sun" icon="lock" title={st === 'lobby' ? 'Not started yet' : 'This group chat has ended'}>
            {st === 'lobby' ? 'You can read along once it starts. Writing opens at the start time.' : 'You can still read it until it is deleted.'}
          </Banner>
        </View>
      )}
      <Sheet visible={!!reporting} onClose={() => setReporting(null)} title="Report this message" testID="group-report-sheet">
        <Text variant="small" muted>
          A person on our team reviews every report. They are not told who reported. The conversation is kept for the review even after the chat is deleted.
        </Text>
        {REASONS.map((r) => (
          <Check key={r.value} checked={reason === r.value} label={r.label} onPress={() => setReason(r.value)} />
        ))}
        <Button
          testID="group-report-submit"
          label="Send report"
          onPress={() => {
            if (reporting) api.groups.report(g.id, reporting.id, reason)
            setReporting(null)
          }}
        />
      </Sheet>
    </KeyboardAvoidingView>
  )
}
