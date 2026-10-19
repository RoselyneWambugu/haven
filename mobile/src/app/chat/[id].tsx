import { useEffect, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Check } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { now } from '@/lib/clock'
import { go, goBack } from '@/lib/nav'
import { canChat, planState } from '@/lib/plan'
import { detectDistress } from '@/lib/safety'
import { clock } from '@/lib/time'
import { useDb } from '@/store/db'
import type { Message, ReportReason } from '@/api'
import { colors, MAX_WIDTH } from '@/theme'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'threats', label: 'Threats' },
  { value: 'sexual', label: 'Sexual or unwanted content' },
  { value: 'scam', label: 'Scam or asking for money' },
  { value: 'self-harm', label: 'Encouraging self-harm' },
  { value: 'other', label: 'Something else' },
]

/**
 * A conversation. A message with a link, phone number, address or similar is stopped before it is sent,
 * with a plain reason, and the text stays in the box so it can be edited (PRD MSG-3 to MSG-5).
 */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const conv = useDb((s) => s.conversations.find((c) => c.id === id))
  const sub = useDb((s) => s.subscription)
  const disappearingOn = useDb((s) => s.content.flags.disappearing)
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState<ReportReason>('harassment')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const list = useRef<FlatList<Message>>(null)

  useEffect(() => {
    if (!id) return
    api.chat.open(id)
    return () => api.chat.close()
  }, [id])

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [conv?.messages.length])

  if (!conv) {
    return (
      <View testID="chat-gone" style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top, paddingHorizontal: 18, gap: 14 }}>
        <TopBar back />
        <Text variant="title">This chat isn’t here</Text>
        <Button label="Back to chats" onPress={() => goBack('/chats')} />
      </View>
    )
  }

  const therapist = conv.therapistId ? THERAPISTS.find((t) => t.id === conv.therapistId) : null
  const name = conv.peer?.penName ?? therapist?.name ?? 'Therapist'
  const readOnly = conv.kind === 'peer' && !canChat(planState(sub, now()))
  const closed = conv.ended || readOnly
  const distress = detectDistress(text).level

  function send() {
    const r = api.chat.send(conv!.id, text)
    if (!r.ok) {
      if (r.code !== 'empty') setError(r.error)
      return
    }
    setText('')
    setError(null)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="chat">
      <View style={{ paddingTop: insets.top, paddingHorizontal: 18 }}>
        <TopBar
          back
          urgent
          right={
            <Pressable testID="chat-menu" accessibilityRole="button" accessibilityLabel="Chat options" onPress={() => setMenu(true)} hitSlop={8} style={{ padding: 8 }}>
              <Icon name="dots" size={22} color={colors.ink} />
            </Pressable>
          }
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
          {conv.peer ? <Avatar kind={conv.peer.avatar} size={40} /> : <Icon name="heart" size={26} color={colors.mossDeep} />}
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" muted>
              {conv.disappearing === 'on' ? 'Disappearing messages on' : therapist ? therapist.title : conv.peer ? conv.peer.languages.join(', ') : ''}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        ref={list}
        data={conv.messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 10, gap: 8, maxWidth: MAX_WIDTH }}
        renderItem={({ item }) =>
          item.from === 'system' ? (
            <Text variant="caption" muted align="center" style={{ paddingVertical: 6 }}>
              {item.text}
            </Text>
          ) : (
            <View style={{ alignSelf: item.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <View style={{ backgroundColor: item.from === 'me' ? colors.moss : colors.milk, borderWidth: item.from === 'me' ? 0 : 1, borderColor: colors.line, borderRadius: 20, borderBottomRightRadius: item.from === 'me' ? 6 : 20, borderBottomLeftRadius: item.from === 'me' ? 20 : 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text variant="body" color={item.from === 'me' ? colors.white : colors.ink}>
                  {item.text}
                </Text>
              </View>
              <Text variant="caption" muted align={item.from === 'me' ? 'right' : 'left'} style={{ marginTop: 2 }}>
                {clock(item.at)}
              </Text>
            </View>
          )
        }
      />

      {closed ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 14), gap: 10 }}>
          <Banner tone="sun" icon="lock" title={conv.ended ? 'This conversation has ended' : 'Chat is read-only'}>
            {conv.ended ? 'You can still read it. Find someone new from Chats.' : 'Your plan has ended, so you can read this chat but not reply.'}
          </Banner>
          {!conv.ended ? <Button testID="chat-renew" label="Renew your plan" onPress={() => go('/plans')} /> : null}
        </View>
      ) : (
        <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper }}>
          {distress !== 'none' ? (
            <Banner tone="sun" icon="heart" title="It sounds like things are heavy">
              Urgent help is free and open now. Tap “Urgent help” at the top any time.
            </Banner>
          ) : null}
          {error ? (
            <View testID="chat-block-reason">
              <Banner tone="clay" icon="shield" title="This message wasn’t sent">
                {error}
              </Banner>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              testID="chat-input"
              value={text}
              onChangeText={(v) => {
                setText(v)
                if (error) setError(null)
              }}
              placeholder="Write a message"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Message"
              multiline
              maxLength={1000}
              style={{ flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23, borderWidth: 1.5, borderColor: error ? colors.clay : colors.line, backgroundColor: colors.milk, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, color: colors.ink, fontSize: 16 }}
            />
            <Pressable
              testID="chat-send"
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!text.trim()}
              onPress={send}
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() ? colors.moss : colors.lichenDeep, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="send" size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={name} testID="chat-menu-sheet">
        <View>
          {conv.kind === 'peer' && (disappearingOn || conv.disappearing === 'on') ? (
            conv.disappearing === 'on' ? (
              <Row icon="clock" title="Turn off disappearing messages" onPress={() => { api.chat.turnOffDisappearing(conv.id); setMenu(false) }} />
            ) : (
              <Row icon="clock" title="Disappearing messages" sub="Both of you need to agree. Messages vanish after 24 hours." onPress={() => { api.chat.proposeDisappearing(conv.id); setMenu(false) }} />
            )
          ) : null}
          <Row icon="mute" title={conv.muted ? 'Unmute' : 'Mute notifications'} onPress={() => { api.chat.setMuted(conv.id, !conv.muted); setMenu(false) }} />
          {conv.kind === 'peer' ? (
            <>
              <Row testID="chat-report" icon="flag" title="Report" onPress={() => { setMenu(false); setReporting(true) }} />
              <Row testID="chat-block" icon="block" title="Block" danger onPress={() => { setMenu(false); setConfirmBlock(true) }} />
              {!conv.ended ? <Row icon="end" title="End this conversation" last onPress={() => { setMenu(false); setConfirmEnd(true) }} /> : null}
            </>
          ) : null}
        </View>
      </Sheet>

      <Sheet visible={reporting} onClose={() => setReporting(false)} title="Report this person" testID="report-sheet">
        <Text variant="small" muted>
          A person on our team reviews every report. They are not told who reported.
        </Text>
        {REASONS.map((r) => (
          <Check key={r.value} checked={reason === r.value} label={r.label} onPress={() => setReason(r.value)} />
        ))}
        <Check checked={alsoBlock} label="Also block them" onPress={() => setAlsoBlock((v) => !v)} />
        <Button
          testID="report-submit"
          label="Send report"
          onPress={() => {
            api.report.submit({ target: 'member', targetId: conv.peer?.id ?? conv.id, reason, note: '' })
            setReporting(false)
            if (alsoBlock) {
              api.chat.block(conv.id, false)
              goBack('/chats')
            }
          }}
        />
      </Sheet>

      <Sheet visible={confirmBlock} onClose={() => setConfirmBlock(false)} title={`Block ${name}?`}>
        <Text variant="small">They won’t be able to match with you or message you again. They aren’t told.</Text>
        <Button
          testID="block-confirm"
          variant="danger"
          label="Block"
          onPress={() => {
            api.chat.block(conv.id, false)
            setConfirmBlock(false)
            goBack('/chats')
          }}
        />
        <Button variant="ghost" label="Cancel" onPress={() => setConfirmBlock(false)} />
      </Sheet>

      <Sheet visible={confirmEnd} onClose={() => setConfirmEnd(false)} title="End this conversation?">
        <Text variant="small">You can still read it, but neither of you can send more messages.</Text>
        <Button
          variant="danger"
          label="End conversation"
          onPress={() => {
            api.chat.end(conv.id)
            setConfirmEnd(false)
          }}
        />
        <Button variant="ghost" label="Keep it open" onPress={() => setConfirmEnd(false)} />
      </Sheet>
    </KeyboardAvoidingView>
  )
}
