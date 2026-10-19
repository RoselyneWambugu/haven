import { Screen, TopBar } from '@/components/Layout'
import { Row } from '@/components/Surfaces'
import { Segmented } from '@/components/Controls'
import { Text } from '@/components/Text'
import { View } from 'react-native'
import { api } from '@/api'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

export default function Settings() {
  const lang = useDb((s) => s.account?.settings.language ?? 'en')
  return (
    <Screen testID="settings" header={<TopBar back title="Settings" />}>
      <Text variant="title">Settings</Text>
      <View style={{ gap: 6 }}>
        <Text variant="small" muted>
          Language
        </Text>
        <Segmented value={lang} onChange={(v) => api.auth.setSettings({ language: v })} options={[{ value: 'en', label: 'English' }, { value: 'sw', label: 'Kiswahili' }]} />
        {lang === 'sw' ? (
          <Text variant="caption" muted>
            Kiswahili is a draft that a native speaker still needs to review.
          </Text>
        ) : null}
      </View>
      <View>
        <Row testID="set-notifications" icon="bell" title="Notifications" onPress={() => go('/settings/notifications')} />
        <Row testID="set-privacy" icon="eye" title="Privacy and data" onPress={() => go('/settings/privacy')} />
        <Row testID="set-security" icon="lock" title="Security" onPress={() => go('/settings/security')} />
        <Row icon="help" title="Help" onPress={() => go('/help')} />
        <Row testID="set-delete" icon="trash" title="Delete my account" danger last onPress={() => go('/settings/delete')} />
      </View>
    </Screen>
  )
}
