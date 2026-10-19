import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

/**
 * Sign in with a phone number and a one-time code. The wording is the same whether
 * or not the number has an account, so this screen can't be used to find out who is
 * on Echo (PRD ACC-15).
 */
export default function Login() {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  function send() {
    const r = api.auth.requestOtp('login', phone)
    if (!r.ok) return setError(r.error)
    go('/otp?purpose=login')
  }

  return (
    <Screen testID="login" keyboard header={<TopBar back />} footer={<Button testID="login-send" label="Send code" onPress={send} />}>
      <Text variant="title">Log in to Echo</Text>
      <Text variant="body" muted>
        We’ll text you a 6-digit code. No password needed.
      </Text>
      <Field testID="login-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={(v) => { setPhone(v); setError(null) }} keyboardType="phone-pad" autoComplete="tel" error={error} />
      <Banner tone="green" icon="shield">
        If this number has an account, a code is on its way. We say this either way, so nobody can use this screen to check who is on Echo.
      </Banner>
      <Pressable accessibilityRole="button" onPress={() => go('/recovery')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
        <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
          I can’t get codes on this number
        </Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
        <Text variant="small" muted>
          New here?
        </Text>
        <Pressable accessibilityRole="button" onPress={() => go('/consent')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            Create an account
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}
