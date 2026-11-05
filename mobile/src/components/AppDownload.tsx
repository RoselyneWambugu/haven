import { Linking, View } from 'react-native'
import { Button } from '@/components/Button'
import { ANDROID_APP_URL, APP_IN_STORES, IOS_APP_URL } from '@/lib/appLinks'
import { go } from '@/lib/nav'

const open = (url: string): void => void Linking.openURL(url)

/**
 * The download buttons. With store addresses set there is one button for each store that has one; without them there is one
 * "Download the app" button that opens a page explaining where the app is.
 */
export function AppDownload({ variant = 'primary' }: { variant?: 'primary' | 'ghost' }) {
  if (!APP_IN_STORES) return <Button testID="download-app" label="Download the app" icon="phone" variant={variant} block={false} onPress={() => go('/mobile-app')} />
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {ANDROID_APP_URL ? <Button testID="download-android" label="Get it on Google Play" icon="phone" variant={variant} block={false} onPress={() => open(ANDROID_APP_URL)} /> : null}
      {IOS_APP_URL ? <Button testID="download-ios" label="Download on the App Store" icon="phone" variant={variant} block={false} onPress={() => open(IOS_APP_URL)} /> : null}
    </View>
  )
}
