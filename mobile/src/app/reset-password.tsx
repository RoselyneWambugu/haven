import { useEffect, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { replace } from '@/lib/nav'
import { showToast } from '@/store/toast'

/** Where the reset link lands: choose a new password, and you are signed in and taken on. */
export default function ResetPassword() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.auth.hasRecoverySession().then(setReady)
  }, [])

  async function save() {
    if (password !== again) return setError('The two passwords don’t match.')
    setBusy(true)
    const r = await api.auth.setNewPassword(password)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    showToast('Your password has been changed.')
    const next = r.value.next
    replace(next === 'trust-device' ? '/trust-device' : next === 'consent' ? '/consent' : '/register')
  }

  if (ready === false) {
    return (
      <Screen testID="reset-expired" header={<TopBar back />}>
        <Text variant="title">This link has expired</Text>
        <Text variant="body" muted>
          Reset links work for one hour and only once. Ask for a new one.
        </Text>
        <Button testID="reset-ask-again" label="Ask for a new link" onPress={() => replace('/forgot-password')} />
      </Screen>
    )
  }

  return (
    <Screen testID="reset-password" keyboard header={<TopBar />} footer={<Button testID="reset-save" label={busy ? 'Saving…' : 'Save password'} disabled={busy || ready === null} onPress={save} />}>
      <Text variant="title">Choose a new password</Text>
      <Field testID="reset-new" label="New password" hint="At least 8 characters, with a letter and a number." value={password} onChangeText={(v) => { setPassword(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
      <Field testID="reset-again" label="New password again" value={again} onChangeText={(v) => { setAgain(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={error} />
      <Banner tone="green" icon="lock">
        After you save, you’ll be signed in.
      </Banner>
    </Screen>
  )
}
