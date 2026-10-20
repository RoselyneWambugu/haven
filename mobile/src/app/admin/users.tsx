import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

/** Users, seen publicly: pen names only. Real identity is behind a logged, approved break-glass request (PRV-2). */
export default function Users() {
  useDb((s) => s.admin)
  useDb((s) => s.account)
  const [q, setQ] = useState('')
  const users = api.admin.users().filter((u) => u.penName.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <PortalPage testID="admin-users" title="Users" sub="Search by pen name. Real names are never shown here.">
      <Field testID="user-search" label="Search" hideLabel placeholder="Pen name" value={q} onChangeText={setQ} />
      <Panel style={{ padding: 8, gap: 0 }}>
        {users.map((u) => (
          <Pressable key={u.id} testID={`user-${u.penName}`} accessibilityRole="button" accessibilityLabel={`${u.penName}, ${u.standing}`} onPress={() => go(`/admin/user/${u.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 52 }}>
            <Text variant="label" style={{ flex: 2 }}>
              {u.penName}
              {u.isMember ? ' (you)' : ''}
            </Text>
            <Text variant="small" muted style={{ flex: 1 }}>
              {u.ageBand}
            </Text>
            <Text variant="small" muted style={{ flex: 1 }}>
              {u.strikes.length} strike{u.strikes.length === 1 ? '' : 's'}
            </Text>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <Badge tone={u.standing === 'good' ? 'green' : 'sun'} label={u.standing === 'good' ? 'Good standing' : u.standing === 'restricted' ? 'Restricted' : 'Paused'} />
            </View>
          </Pressable>
        ))}
        {!users.length ? (
          <Text variant="small" muted style={{ padding: 14 }}>
            No one by that name.
          </Text>
        ) : null}
      </Panel>
    </PortalPage>
  )
}
