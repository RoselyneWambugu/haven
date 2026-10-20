import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { go } from '@/lib/nav'
import { relative } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

export default function TicketThread() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useDb((s) => s.tickets.find((x) => x.id === id))
  const departments = useDb((s) => s.content.departments)
  const [text, setText] = useState('')
  useEffect(() => {
    if (t?.unread) api.tickets.markRead(t.id)
  }, [t?.unread, t?.id])
  if (!t) return null
  return (
    <Screen
      testID="ticket-thread"
      keyboard
      header={<TopBar back title={departments.find((d) => d.id === t.deptId)?.title} />}
      footer={
        t.status === 'resolved' ? undefined : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Field testID="ticket-reply" label="Reply" hideLabel placeholder="Write a reply" value={text} onChangeText={setText} />
            </View>
            <Button testID="ticket-reply-send" size="sm" label="Send" disabled={!text.trim()} onPress={() => { api.tickets.reply(t.id, text); setText('') }} />
          </View>
        )
      }
    >
      <Text variant="title">{t.subject}</Text>
      {t.routedToCrisis ? (
        <Banner tone="sun" icon="heart" title="Urgent help is open now">
          If you’re in danger, don’t wait for a reply.
        </Banner>
      ) : null}
      {t.routedToCrisis ? <Button variant="urgent" label="Get urgent help" onPress={() => go('/urgent')} /> : null}
      {t.messages.map((m) => (
        <View key={m.id} style={{ alignSelf: m.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
          <View style={{ backgroundColor: m.from === 'me' ? colors.moss : colors.milk, borderWidth: m.from === 'me' ? 0 : 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text variant="body" color={m.from === 'me' ? colors.white : colors.ink}>
              {m.text}
            </Text>
          </View>
          <Text variant="caption" muted style={{ marginTop: 2 }}>
            {m.from === 'me' ? 'You' : 'Echo support'} · {relative(m.at, now())}
          </Text>
        </View>
      ))}
      {t.status === 'open' ? (
        <Text variant="caption" muted>
          We usually reply within a day.
        </Text>
      ) : null}
      {t.status === 'replied' ? <Button variant="quiet" label="Mark as resolved" onPress={() => api.tickets.resolve(t.id)} /> : null}
      {t.status === 'resolved' ? <Banner tone="green" icon="check">This ticket is resolved. Start a new one if you need more help.</Banner> : null}
    </Screen>
  )
}
