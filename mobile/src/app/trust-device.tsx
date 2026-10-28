import { useState } from 'react'
import { Platform, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Card } from '@/components/Surfaces'
import { Radio } from '@/components/Controls'
import { Text } from '@/components/Text'
import { Icon } from '@/components/Icon'
import { resetTo } from '@/lib/nav'
import { colors } from '@/theme'

/**
 * After signing in on a new device: is this phone yours? "Mine" keeps the session and
 * turns on app lock. "Shared" signs you out after 24 hours and clears the phone (PRD ACC-14, D41).
 */
export default function TrustDevice() {
  const [own, setOwn] = useState(true)
  return (
    <Screen
      testID="trust-device"
      header={<TopBar logo />}
      footer={
        <Button
          testID="trust-continue"
          label="Continue"
          onPress={async () => {
            await api.auth.trustDevice(own, Platform.OS)
            resetTo('/home')
          }}
        />
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="phone" size={24} color={colors.mossDeep} />
          <View>
            <Text variant="label">{Platform.OS === 'web' ? 'This browser' : 'This phone'}</Text>
            <Text variant="small" muted>
              Signed in just now, near Nairobi
            </Text>
          </View>
        </View>
      </Card>
      <Text variant="title">Is this your own phone?</Text>
      <Radio testID="trust-own" selected={own} onPress={() => setOwn(true)} label="Yes, it’s mine" sub="Keep me signed in and lock the app with my fingerprint or PIN." />
      <Radio testID="trust-shared" selected={!own} onPress={() => setOwn(false)} label="It’s shared or borrowed" sub="Sign me out after 24 hours and clear my data from this phone when I leave." />
      <Text variant="caption" muted>
        You can change this later in Settings, then Security.
      </Text>
    </Screen>
  )
}
