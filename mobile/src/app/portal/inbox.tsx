import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Count } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, useWide } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { clock, dayAndClock, relative } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/** A stable empty list, so a selector that falls back to it doesn't look like a change on every render. */
const NONE: never[] = []

/** Client inbox. The same sharing limits apply as for members, and offers move to booking rather than private contact. */
export default function Inbox() {
  const threads = useDb((s) => s.portal?.threads ?? NONE)
  const wide = useWide()
  const [openId, setOpenId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const selected = threads.find((t) => t.id === (openId ?? (wide ? threads[0]?.id : null)))

  function open(id: string) {
    api.portal.openThread(id)
    setOpenId(id)
    setError(null)
  }
  function send() {
    if (!selected) return
    const r = api.portal.send(selected.id, text)
    if (!r.ok) return setError(r.error)
    setText('')
    setError(null)
  }

  const list = (
    <Panel style={{ flex: wide ? 1 : undefined, padding: 8, gap: 0 }} testID="thread-list">
      {threads.map((t) => {
        const last = t.messages[t.messages.length - 1]
        return (
          <Pressable key={t.id} testID={`thread-${t.clientName}`} accessibilityRole="button" accessibilityLabel={`${t.clientName}${t.unread ? `, ${t.unread} new` : ''}`} onPress={() => open(t.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: selected?.id === t.id ? colors.lichen : 'transparent', minHeight: 60 }}>
            <Avatar kind={t.clientAvatar} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="label">
                {t.clientName} {t.closed ? '· closed' : ''}
              </Text>
              <Text variant="small" muted numberOfLines={1}>
                {last?.text}
              </Text>
            </View>
            {t.unread > 0 ? <Count n={t.unread} /> : null}
          </Pressable>
        )
      })}
    </Panel>
  )

  const thread = selected ? (
    <Panel style={{ flex: wide ? 2 : undefined, minHeight: 420 }} testID="thread-view">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {!wide ? <Button size="sm" variant="ghost" label="Back" onPress={() => setOpenId(null)} /> : null}
        <Avatar kind={selected.clientAvatar} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="h3">{selected.clientName}</Text>
          {selected.nextSession ? (
            <Text variant="caption" muted>
              Next: {dayAndClock(selected.nextSession)}
            </Text>
          ) : null}
        </View>
        <Pressable testID="thread-menu" accessibilityRole="button" accessibilityLabel="Thread options" onPress={() => setMenu(true)} style={{ padding: 10 }}>
          <Text variant="h3">⋮</Text>
        </Pressable>
      </View>
      <Banner tone="green" icon="lock">
        Clients are anonymous: you see a pen name and avatar only.
      </Banner>
      <View style={{ gap: 8, flex: 1 }}>
        {selected.messages.map((m) =>
          m.from === 'system' ? (
            <Text key={m.id} variant="caption" muted align="center">
              {m.text}
            </Text>
          ) : (
            <View key={m.id} style={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <View style={{ backgroundColor: m.from === 'me' ? colors.moss : colors.paper, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, borderWidth: m.from === 'me' ? 0 : 1, borderColor: colors.line }}>
                <Text variant="body" color={m.from === 'me' ? colors.white : colors.ink}>
                  {m.text}
                </Text>
              </View>
              <Text variant="caption" muted align={m.from === 'me' ? 'right' : 'left'}>
                {clock(m.at)}
              </Text>
            </View>
          ),
        )}
      </View>
      {selected.closed ? (
        <Text variant="small" muted>
          This thread is closed.
        </Text>
      ) : (
        <>
          {error ? (
            <View testID="inbox-block-reason">
              <Banner tone="clay" icon="shield" title="This message wasn’t sent">
                {error}
              </Banner>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field testID="inbox-input" label="Reply" hideLabel placeholder="Write a reply…" value={text} onChangeText={(v) => { setText(v); setError(null) }} />
            </View>
            <Button testID="inbox-send" label="Send" disabled={!text.trim()} onPress={send} />
          </View>
          <Text variant="caption" muted>
            Links, phone numbers and addresses can’t be sent. Offer a session with “Offer a time” instead.
          </Text>
        </>
      )}
      <Sheet visible={menu} onClose={() => setMenu(false)} title={selected.clientName}>
        <View>
          <Row icon="cal" title="Offer a time" sub="The client can book it from Echo" onPress={() => { api.portal.offerTime(selected.id, now() + 3 * 24 * 3600_000); setMenu(false) }} />
          <Row icon="flag" title="Raise a concern" onPress={() => { setMenu(false); go('/portal/concern') }} />
          <Row icon="close" title="Close thread" last onPress={() => { api.portal.closeThread(selected.id); setMenu(false) }} />
        </View>
      </Sheet>
    </Panel>
  ) : (
    <Panel style={{ flex: 2 }}>
      <Text variant="small" muted>
        Choose a conversation.
      </Text>
    </Panel>
  )

  return (
    <PortalPage testID="portal-inbox" title="Inbox" sub={`Last checked ${relative(now(), now())}`}>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>{wide ? <>{list}{thread}</> : selected && openId ? thread : list}</View>
    </PortalPage>
  )
}
