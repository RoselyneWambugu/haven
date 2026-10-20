import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Badge } from '@/components/Controls'
import { Panel, PortalPage } from '@/components/Portal'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

export default function Appeals() {
  useDb((s) => s.admin)
  useDb((s) => s.account)
  const list = api.admin.appeals()
  const open = list.filter((a) => a.status === 'open')
  return (
    <PortalPage testID="admin-appeals" title="Appeals" sub="A different reviewer decides every appeal.">
      <Panel title={`Open (${open.length})`} style={{ gap: 0 }}>
        {open.length ? (
          open.map((a) => (
            <Pressable key={a.id} testID={`appeal-${a.id}`} accessibilityRole="button" accessibilityLabel={`${a.id}, ${a.penName}`} onPress={() => go(`/admin/appeal/${a.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 }}>
              <Text variant="label" style={{ width: 90 }} numberOfLines={1}>
                {a.therapistId ? 'Therapist' : a.id.length > 10 ? 'Member' : a.id}
              </Text>
              <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
                {a.penName} · {a.decision}
              </Text>
              <Text variant="caption" muted>
                SLA {a.slaHours} h
              </Text>
            </Pressable>
          ))
        ) : (
          <Text variant="small" muted>
            No open appeals.
          </Text>
        )}
      </Panel>
      <Panel title="Decided">
        {list.filter((a) => a.status !== 'open').map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {a.penName} · {a.decision}
            </Text>
            <Badge label={a.status === 'upheld' ? 'Upheld' : a.status === 'reduced' ? 'Reduced' : 'Overturned'} tone="plain" />
          </View>
        ))}
        {!list.some((a) => a.status !== 'open') ? (
          <Text variant="small" muted>
            None yet.
          </Text>
        ) : null}
      </Panel>
    </PortalPage>
  )
}
