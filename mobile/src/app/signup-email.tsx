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

/** Sign up with an email and a password. Supabase emails a link; opening it confirms the address and carries on to registration. */
export default function SignupEmail() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const { for: who } = useLocalSearchParams<{ for?: string }>()
  const staffOrTherapist = who === 'portal' || who === 'admin'
  // Members use the mobile app, so on the live website these pages are only for therapists and staff.
  if (!MEMBERS_ON_WEB && who !== 'portal' && who !== 'admin') return <Redirect href="/mobile-app" />

  async function submit() {
    if (password !== again) return setErrors({ again: 'The two passwords don’t match.' })
    setBusy(true)
    const r = await api.auth.signUpWithEmail(email, password)
    setBusy(false)
    if (!r.ok) return setErrors({ [r.code === 'email' || r.code === 'password' ? r.code : 'form']: r.error })
    if (r.value.next === 'check-email') return setSent(true)
    const n = r.value.next
    replace(n === 'portal' ? '/portal/today' : n === 'admin' ? '/staff/overview' : n === 'trust-device' ? '/trust-device' : n === 'consent' ? '/consent' : '/register')
  }

  if (sent) {
    return (
      <Screen testID="signup-email-sent" header={<TopBar back />}>
        <Text variant="title">Check your email</Text>
        <Text variant="body" muted>
          We sent a link to {email.trim()}. Open it to confirm your address and carry on. It can take a minute, and it may land in spam.
        </Text>
        <Button testID="signup-resend" variant="quiet" label="Send it again" onPress={async () => { const r = await api.auth.signUpWithEmail(email, password); if (!r.ok) setErrors({ form: r.error }) }} />
        {errors.form ? <Banner tone="clay">{errors.form}</Banner> : null}
        <Pressable accessibilityRole="button" onPress={() => go(staffOrTherapist ? `/login-email?for=${who}` : '/login-email')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            I’ve confirmed it, log in
          </Text>
        </Pressable>
      </Screen>
    )
  }

  return (
    <Screen testID="signup-email" keyboard header={<TopBar back />} footer={<Button testID="signup-email-submit" label={busy ? 'Creating…' : 'Create account'} disabled={busy} onPress={submit} />}>
      <Text variant="title">{staffOrTherapist ? 'Create your sign-in' : 'Sign up with email'}</Text>
      {staffOrTherapist ? (
        <Text variant="small" muted>
          Use the email address Echo has linked to your {who === 'portal' ? 'therapist' : 'staff'} account. After you confirm it, you go straight to your {who === 'portal' ? 'dashboard' : 'staff dashboard'}.
        </Text>
      ) : null}
      <Field testID="signup-email-address" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setErrors({}) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errors.email} />
      <Field testID="signup-email-password" label="Password" hint="At least 8 characters, with a letter and a number." value={password} onChangeText={(v) => { setPassword(v); setErrors({}) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={errors.password} />
      <Field testID="signup-email-again" label="Password again" value={again} onChangeText={(v) => { setAgain(v); setErrors({}) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={errors.again} />
      {errors.form ? <Banner tone="clay">{errors.form}</Banner> : null}
      <Banner tone="green" icon="lock">
        This stays private. Others only ever see your pen name and avatar.
      </Banner>
      <Text variant="caption" muted>
        Already have an Echo account with your phone? Log in with your phone, then add an email and password under Settings, Sign-in methods, so you keep one account.
      </Text>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
        <Text variant="small" muted>
          Have an account?
        </Text>
        <Pressable accessibilityRole="button" onPress={() => replace(staffOrTherapist ? `/login-email?for=${who}` : '/login-email')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            Log in
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}
