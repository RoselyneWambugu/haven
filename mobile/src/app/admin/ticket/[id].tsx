import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ownsDepartment } from '@/lib/content'
import { clock, dayShort } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/** A ticket thread for staff. You see the member's pen name only. Your reply is sent as "Echo staff". */
export default function TicketThread() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const a = useDb((s) => s.admin)
  const t = useDb((s) => s.tickets.find((x) => x.id === id))
  const c = useDb((s) => s.content)
  const penName = useDb((s) => s.account?.public.penName)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!a || !t) return null
  const dept = c.departments.find((d) => d.id === t.deptId)
  const can = ownsDepartment(a.role, dept)

  return (
    <PortalPage testID="admin-ticket" title={t.subject} sub={`${penName ?? 'Member'} · ${dept?.title} · reply within ${dept?.slaHours} hours`} actions={t.routedToCrisis ? <Badge tone="sun" icon="heart" label="Crisis queue" /> : undefined}>
      {t.routedToCrisis ? (
        <Banner tone="sun" icon="heart" title="This may be someone in distress">
          It was routed to the crisis queue. Follow the crisis protocol, and don’t wait for the usual response time.
        </Banner>
      ) : null}
      <Panel>
        {t.messages.map((m) => (
          <View key={m.id} style={{ alignSelf: m.from === 'staff' ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 2 }}>
            <View style={{ backgroundColor: m.from === 'staff' ? colors.moss : colors.paper, borderRadius: 16, padding: 12, borderWidth: m.from === 'staff' ? 0 : 1, borderColor: colors.line }}>
              <Text variant="body" color={m.from === 'staff' ? colors.white : colors.ink}>
                {m.text}
              </Text>
            </View>
            <Text variant="caption" muted align={m.from === 'staff' ? 'right' : 'left'}>
              {m.from === 'staff' ? 'Echo staff' : penName ?? 'Member'} · {dayShort(m.at)} {clock(m.at)}
            </Text>
          </View>
        ))}
      </Panel>
      {!can ? (
        <Banner tone="sun" icon="lock">
          This ticket belongs to the {dept?.owner} team. You can read it, but not reply.
        </Banner>
      ) : t.status === 'resolved' ? (
        <Banner tone="green" icon="check">
          Resolved. The member can reopen it by replying.
        </Banner>
      ) : (
        <Panel title="Reply as Echo staff">
          <Text variant="caption" muted>
            Never ask for an M-Pesa PIN, password or full card number.
          </Text>
          <Field testID="staff-reply" label="Reply" hideLabel multiline minHeight={100} value={text} onChangeText={(v) => { setText(v); setError(null) }} error={error} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              testID="staff-send"
              label="Send reply"
              onPress={() => {
                const r = api.resources.replyTicket(t.id, text)
                if (!r.ok) return setError(r.error)
                setText('')
              }}
            />
            {t.status === 'replied' ? <Button testID="staff-resolve" variant="quiet" label="Mark as resolved" onPress={() => api.resources.resolveTicket(t.id)} /> : null}
          </View>
        </Panel>
      )}
    </PortalPage>
  )
}
