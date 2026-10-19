import { useCallback, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { useT } from '@/i18n'
import { resetTo } from '@/lib/nav'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/**
 * The lock screen (PRD ACC-13). It shows the avatar but hides the pen name by default, in case the
 * phone is seen by others. Echo never stores biometric data: the phone does the checking.
 */
export default function Unlock() {
  const t = useT()
  const avatar = useDb((s) => s.account?.public.avatar ?? 'moon')
  const penName = useDb((s) => s.account?.public.penName ?? '')
  const hideName = useDb((s) => s.account?.settings.hidePenNameOnLock ?? true)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const authenticate = useCallback(async () => {
    setError(null)
    try {
      const has = await LocalAuthentication.hasHardwareAsync()
      const enrolled = has && (await LocalAuthentication.isEnrolledAsync())
      setAvailable(!!enrolled)
      if (!enrolled) return
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Echo', cancelLabel: 'Cancel' })
      if (r.success) {
        api.auth.unlock()
        resetTo('/home')
      } else {
        setError('That didn’t work. Try again, or sign in with your phone number.')
      }
    } catch {
      setAvailable(false)
    }
  }, [])

  useEffect(() => {
    void authenticate()
  }, [authenticate])

  return (
    <Screen
      testID="unlock"
      scroll={false}
      header={<TopBar logo />}
      footer={
        <Pressable
          testID="unlock-switch"
          accessibilityRole="button"
          onPress={() => {
            api.auth.signOut()
            resetTo('/login')
          }}
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            Sign in with my phone number instead
          </Text>
        </Pressable>
      }
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Avatar kind={avatar} size={96} />
        <Text variant="title">Welcome back</Text>
        {hideName ? null : (
          <Text variant="body" muted>
            {penName}
          </Text>
        )}
        <Text variant="small" muted>
          Unlock to continue
        </Text>
        {available === false ? (
          <View style={{ gap: 12, alignSelf: 'stretch' }}>
            <Banner tone="sun" title="Demo">
              No fingerprint or device lock is available here, so this button stands in for it.
            </Banner>
            <Button
              testID="unlock-button"
              label={t('Continue')}
              onPress={() => {
                api.auth.unlock()
                resetTo('/home')
              }}
            />
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Pressable
              testID="unlock-biometric"
              accessibilityRole="button"
              accessibilityLabel="Unlock with fingerprint or device PIN"
              onPress={() => void authenticate()}
              style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.lichen, borderWidth: 2, borderColor: colors.moss, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="lock" size={30} color={colors.mossDeep} />
            </Pressable>
            <Text variant="small" muted>
              Use your fingerprint or device PIN
            </Text>
          </View>
        )}
        {error ? (
          <Text variant="small" color={colors.clay} align="center">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}
