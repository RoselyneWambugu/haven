import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { MEMBERS_ON_WEB } from '@/lib/webMembers'
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
  // Therapists and staff come here from their own sign-in pages; the address then says who is signing in.
  const { for: who } = useLocalSearchParams<{ for?: string }>()
  const purpose = who === 'portal' || who === 'admin' ? who : 'login'
  // Members use the mobile app, so on the live website these pages are only for therapists and staff.
  if (!MEMBERS_ON_WEB && who !== 'portal' && who !== 'admin') return <Redirect href="/mobile-app" />

  async function submit() {
    setBusy(true)
    const r = await api.auth.signInWithEmail(email, password, purpose)
    setBusy(false)
    if (!r.ok) {
      if (r.code === 'setup') return replace('/admin/sign-in?setup=1')
      return setError(r.error)
    }
    const next = r.value.next
    replace(next === 'portal' ? '/portal/today' : next === 'admin' ? '/admin/overview' : next === 'trust-device' ? '/trust-device' : next === 'consent' ? '/consent' : '/register')
  }

  return (
    <Screen testID="login-email" keyboard header={<TopBar back />} footer={<Button testID="login-email-submit" label={busy ? 'Logging in…' : 'Log in'} disabled={busy} onPress={submit} />}>
      <Text variant="title">{purpose === 'portal' ? 'Therapist sign-in with email' : purpose === 'admin' ? 'Staff sign-in with email' : 'Log in with email'}</Text>
      <Field testID="login-email-address" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setError(null) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field testID="login-email-password" label="Password" value={password} onChangeText={(v) => { setPassword(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" error={error} />
      <Pressable testID="forgot-password-link" accessibilityRole="link" accessibilityLabel="Forgot password?" onPress={() => go(purpose === 'login' ? '/forgot-password' : `/forgot-password?for=${purpose}`)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
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
          {purpose === 'login' ? 'New here?' : 'First time with email?'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => go(purpose === 'login' ? '/signup-email' : `/signup-email?for=${purpose}`)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            {purpose === 'login' ? 'Sign up with email' : 'Create your sign-in'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}
