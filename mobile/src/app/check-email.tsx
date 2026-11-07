import { useState } from 'react'
import { Pressable } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { clearPendingSignup, getPendingSignup } from '@/backend/pendingSignup'
import { go, replace } from '@/lib/nav'
import { registrationRoute } from '@/lib/registration'
import { getDb } from '@/store/db'
import { colors } from '@/theme'

/** Step 2 of 5 on the real service: Supabase has emailed a link. Opening it confirms the address; this screen then carries on. */
export default function CheckEmail() {
  const pending = getPendingSignup()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirmed() {
    if (!pending) return go('/login-email')
    setBusy(true)
    const r = await api.auth.signInWithEmail(pending.email, pending.password)
    setBusy(false)
    if (!r.ok) {
      setInfo(null)
      return setError(r.code === 'unconfirmed' ? 'We can’t see it confirmed yet. Open the link in the email, then tap this again.' : r.error)
    }
    clearPendingSignup()
    if (r.value.next === 'trust-device') return replace('/trust-device')
    replace(registrationRoute(getDb().reg))
  }

  async function again() {
    if (!pending) return
    const r = await api.auth.signUpWithEmail(pending.email, pending.password)
    if (!r.ok) return setError(r.error)
    setError(null)
    setInfo('Sent again. It can take a minute, and it may land in spam.')
  }

  return (
    <Screen testID="check-email" header={<TopBar back />} footer={<Button testID="email-confirmed" label={busy ? 'Checking…' : 'I’ve confirmed it'} disabled={busy} onPress={confirmed} />}>
      <Text variant="caption" muted>
        Step 2 of 5
      </Text>
      <Text variant="title">Confirm your email</Text>
      <Text variant="body" muted>
        {pending ? `We sent a link to ${pending.email}. Open it to confirm your address, then come back here.` : 'We sent you a link when you signed up. Open it to confirm your address, then log in with your email.'}
      </Text>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {info ? <Banner tone="green">{info}</Banner> : null}
      {pending ? <Button testID="email-resend" variant="quiet" label="Send it again" onPress={again} /> : null}
      <Pressable accessibilityRole="button" onPress={() => go('/login-email')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
        <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
          Log in with my email instead
        </Text>
      </Pressable>
    </Screen>
  )
}
