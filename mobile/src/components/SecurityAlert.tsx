import { View } from 'react-native'
import { api } from '@/api'
import { resetTo } from '@/lib/nav'
import { useDb } from '@/store/db'
import { Button } from './Button'
import { Banner } from './Surfaces'
import { Sheet } from './Sheet'
import { Text } from './Text'

/**
 * Shown when a new device signs in to the account (PRD ACC-20). "No" signs out
 * everywhere and locks the account. It never deletes anything.
 */
export function SecurityAlert() {
  const device = useDb((s) => s.demo.alertDevice)
  const signedIn = useDb((s) => s.signedIn)
  if (!device || !signedIn) return null
  return (
    <Sheet visible onClose={() => api.account.dismissAlert()} title="New sign-in to your account" testID="security-alert">
      <Banner tone="clay">
        <Text variant="small" color="#7A2C1C">
          {device.name}, {device.approxPlace}, just now
        </Text>
      </Banner>
      <Text variant="h3">Was this you?</Text>
      <View style={{ gap: 10 }}>
        <Button label="Yes, it was me" onPress={() => api.account.dismissAlert()} />
        <Button
          label="No, secure my account"
          variant="danger"
          onPress={() => {
            api.account.secure()
            resetTo('/recovery')
          }}
        />
      </View>
      <Text variant="small" muted>
        If you choose “No”, we sign out every device, lock the account and help you recover it. Nothing is deleted. We also send this alert by SMS, in case this phone is not with you.
      </Text>
    </Sheet>
  )
}
