import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go, replace } from '@/lib/nav'
import { colors } from '@/theme'

/** Log in with an email and a password. The "Forgot password?" link leads to the page that emails a reset link. */
export default function LoginEmail() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const r = await api.auth.signInWithEmail(email, password)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const next = r.value.next
    replace(next === 'trust-device' ? '/trust-device' : next === 'consent' ? '/consent' : '/register')
  }

  return (
    <Screen testID="login-email" keyboard header={<TopBar back />} footer={<Button testID="login-email-submit" label={busy ? 'Logging in…' : 'Log in'} disabled={busy} onPress={submit} />}>
      <Text variant="title">Log in with email</Text>
      <Field testID="login-email-address" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setError(null) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field testID="login-email-password" label="Password" value={password} onChangeText={(v) => { setPassword(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" error={error} />
      <Pressable testID="forgot-password-link" accessibilityRole="link" accessibilityLabel="Forgot password?" onPress={() => go('/forgot-password')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
          Forgot password?
        </Text>
      </Pressable>
      <Banner tone="green" icon="shield">
        Your email is private. Other people only ever see your pen name and avatar.
      </Banner>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
        <Text variant="small" muted>
          New here?
        </Text>
        <Pressable accessibilityRole="button" onPress={() => go('/signup-email')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            Sign up with email
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}
