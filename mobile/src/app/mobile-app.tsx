import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { AppDownload } from '@/components/AppDownload'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { APP_IN_STORES } from '@/lib/appLinks'
import { go } from '@/lib/nav'

/** Where a member who reaches the website is sent: Echo for members is the mobile app. Urgent help stays one tap away. */
export default function MobileApp() {
  const { done } = useLocalSearchParams<{ done?: string }>()
  return (
    <Screen testID="mobile-app" header={<TopBar logo />}>
      <Text variant="title">Echo for members is on your phone</Text>
      {done === 'password' ? (
        <Banner tone="green" icon="shield">Your password has been changed. Open the Echo app and log in with it.</Banner>
      ) : done === 'email' ? (
        <Banner tone="green" icon="shield">Your email is confirmed. Open the Echo app and log in, or carry on signing up there.</Banner>
      ) : null}
      <Text variant="body" muted>
        Sign up, log in, chat, and book a therapist in the Echo mobile app. The website is only for therapists and Echo staff.
      </Text>
      {APP_IN_STORES ? (
        <AppDownload />
      ) : (
        <Banner tone="sun" icon="phone" title="The app is on its way" testID="app-not-yet">
          The Echo app isn’t in the app stores yet. Check back soon, and your sign-up will work there the day it arrives.
        </Banner>
      )}
      <View style={{ gap: 10 }}>
        <Button testID="mobile-therapist" variant="quiet" label="Therapist sign in" onPress={() => go('/portal')} />
        <Button testID="mobile-staff" variant="quiet" label="Staff sign in" onPress={() => go('/admin/sign-in')} />
        <Button testID="mobile-urgent" variant="urgent" icon="phone" label="Urgent help" onPress={() => go('/urgent')} />
      </View>
    </Screen>
  )
}
