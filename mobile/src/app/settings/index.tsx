import { Screen, TopBar } from '@/components/Layout'
import { Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { View } from 'react-native'
import { REMOTE } from '@/backend/client'
import { go } from '@/lib/nav'

export default function Settings() {
  return (
    <Screen testID="settings" header={<TopBar back urgent title="Settings" />}>
      <Text variant="title">Settings</Text>
      <View>
        <Row testID="set-notifications" icon="bell" title="Notifications" onPress={() => go('/settings/notifications')} />
        <Row testID="set-privacy" icon="eye" title="Privacy and data" onPress={() => go('/settings/privacy')} />
        {REMOTE ? <Row testID="set-sign-in-methods" icon="lock" title="Sign-in methods" sub="Phone, Google, email and password" onPress={() => go('/settings/sign-in-methods')} /> : null}
        <Row testID="set-security" icon="lock" title="Security" onPress={() => go('/settings/security')} />
        <Row icon="help" title="Help" onPress={() => go('/help')} />
        <Row testID="set-feedback" icon="pencil" title="Send feedback" sub="An idea, or something that is broken" onPress={() => go('/settings/feedback')} />
        <Row testID="set-delete" icon="trash" title="Delete my account" danger last onPress={() => go('/settings/delete')} />
      </View>
    </Screen>
  )
}
