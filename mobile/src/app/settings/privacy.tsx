import { useState } from 'react'
import { Share, View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Segmented, ToggleRow } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { useDb } from '@/store/db'

export default function Privacy() {
  const account = useDb((s) => s.account)
  const muted = useDb((s) => s.mutedAuthors)
  const [exported, setExported] = useState(false)
  if (!account) return null
  async function exportData() {
    const data = api.account.exportData()
    try {
      await Share.share({ message: data, title: 'My Echo data' })
    } catch {
      // Sharing was dismissed.
    }
    setExported(true)
  }
  return (
    <Screen testID="privacy" header={<TopBar back title="Privacy and data" />}>
      <Text variant="title">Privacy and data</Text>
      <ToggleRow testID="open-to-chats" label="Open to new chats" sub="Turn off to stop being matched" on={account.public.openToChats} onChange={(v) => api.match.setOpenToChats(v)} />
      <View style={{ gap: 6 }}>
        <Text variant="small" muted>
          New chats disappear
        </Text>
        <Segmented value={account.settings.disappearingDefault} onChange={(v) => api.auth.setSettings({ disappearingDefault: v })} options={[{ value: 'ask', label: 'Ask me' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Never' }]} />
      </View>
      <Text variant="h3">Blocked members</Text>
      {account.blocked.length ? (
        account.blocked.map((b) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar kind={b.avatar} size={36} />
            <Text variant="body" style={{ flex: 1 }}>
              {b.penName}
            </Text>
            <Button size="sm" variant="quiet" label="Unblock" onPress={() => api.chat.unblock(b.id)} />
          </View>
        ))
      ) : (
        <Text variant="small" muted>
          You haven’t blocked anyone.
        </Text>
      )}
      {muted.length ? (
        <Button variant="ghost" label={`Unmute ${muted.length} community member${muted.length === 1 ? '' : 's'}`} onPress={() => muted.forEach((k) => api.forum.unmuteAuthor(k))} />
      ) : null}
      <Text variant="h3">Your data</Text>
      <Text variant="small" muted>
        Download a copy of your messages, posts, sessions and details.
      </Text>
      <Button testID="export-data" variant="quiet" label="Download my data" onPress={exportData} />
      {exported ? <Banner tone="green" icon="check">Your data is ready to save or share.</Banner> : null}
    </Screen>
  )
}
