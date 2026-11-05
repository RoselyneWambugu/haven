import { useState } from 'react'
import { Pressable } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { replace } from '@/lib/nav'
import { colors } from '@/theme'

/**
 * Forgot password: asks for the email and sends a reset link. The answer is the same whether or not the email has an account,
 * so this page can't be used to find out who is on Echo (PRD ACC-15).
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    const r = await api.auth.requestPasswordReset(email)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSent(true)
  }

  return (
    <Screen testID="forgot-password" keyboard header={<TopBar back />} footer={sent ? undefined : <Button testID="forgot-send" label={busy ? 'Sending…' : 'Email me a link'} disabled={busy} onPress={send} />}>
      <Text variant="title">Forgot your password?</Text>
      {sent ? (
        <>
          <Banner tone="green" icon="shield" testID="forgot-sent">
            If there is an account for {email.trim()}, a link to choose a new password is on its way. It works for one hour and only once.
          </Banner>
          <Text variant="small" muted>
            It can take a minute, and it may land in spam. Open the link on this device or any other.
          </Text>
          <Button testID="forgot-back" variant="quiet" label="Back to log in" onPress={() => replace('/login-email')} />
        </>
      ) : (
        <>
          <Text variant="body" muted>
            Enter the email you signed up with. We’ll send a link to choose a new password.
          </Text>
          <Field testID="forgot-email" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setError(null) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={error} />
          <Pressable accessibilityRole="button" onPress={() => replace('/login')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
              I signed up with my phone number
            </Text>
          </Pressable>
        </>
      )}
    </Screen>
  )
}
