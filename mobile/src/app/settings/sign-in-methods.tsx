import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { formatPhone } from '@/lib/identity'

/**
 * The ways this account can be signed in to. Adding another one here keeps one person on one account: someone who signed up by phone
 * can add Google or an email and password, and someone who signed up with Google or an email can add a phone number.
 */
export default function SignInMethods() {
  // Read from Supabase, so it also works for therapists and staff, who have no member account.
  const [methods, setMethods] = useState<{ phone: string; email: string; google: boolean; password: boolean } | null>(null)
  const reload = useCallback(async () => setMethods(await api.auth.signInMethods()), [])
  useEffect(() => { void reload() }, [reload])
  const [sheet, setSheet] = useState<'none' | 'email' | 'phone'>('none')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!methods) return null

  const hasPhone = !!methods.phone
  const hasGoogle = methods.google
  const hasPassword = methods.password

  function close() {
    setSheet('none')
    setError(null)
    setPassword('')
    setAgain('')
    setCode('')
    setCodeSentTo(null)
  }

  async function link() {
    setError(null)
    const r = await api.auth.linkGoogle()
    if (!r.ok) {
      if (r.code !== 'cancelled') setError(r.error)
      return
    }
    if (r.value.next === 'linked') setInfo('Google is now linked to this account.')
    await reload()
  }

  async function saveEmail() {
    if (password !== again) return setError('The two passwords don’t match.')
    setBusy(true)
    const r = await api.auth.addEmailPassword(email, password)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    close()
    setInfo(`We sent a link to ${email.trim()}. Open it to finish adding your email and password.`)
  }

  async function sendCode() {
    setBusy(true)
    const r = await api.auth.requestAddPhone(phone)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setCodeSentTo(r.value.phone)
  }

  async function confirmCode() {
    setBusy(true)
    const r = await api.auth.confirmAddPhone(codeSentTo ?? '', code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    close()
    setInfo('Your phone number is now on this account.')
    await reload()
  }

  return (
    <Screen testID="sign-in-methods" header={<TopBar back title="Sign-in methods" />}>
      <Text variant="title">Sign-in methods</Text>
      <Text variant="body" muted>
        Add every way you might sign in to this one account, so you never end up with a second one.
      </Text>
      {info ? <Banner tone="green" icon="shield" testID="methods-info">{info}</Banner> : null}
      {error && sheet === 'none' ? <Banner tone="clay">{error}</Banner> : null}
      <Row testID="method-phone" icon="phone" title="Phone number" sub={hasPhone ? formatPhone(methods.phone) : 'Not added'} last={false}
        onPress={hasPhone ? undefined : () => { setSheet('phone'); setError(null) }} right={hasPhone ? undefined : <Text variant="small" bold>Add</Text>} />
      <Row testID="method-google" icon="shield" title="Google" sub={hasGoogle ? 'Linked' : 'Not linked'}
        onPress={hasGoogle ? undefined : link} right={hasGoogle ? undefined : <Text variant="small" bold>Link</Text>} />
      <Row testID="method-password" icon="lock" title="Email and password" sub={hasPassword ? methods.email || 'Added' : 'Not added'} last
        onPress={hasPassword ? undefined : () => { setSheet('email'); setError(null) }} right={hasPassword ? undefined : <Text variant="small" bold>Add</Text>} />
      <Text variant="caption" muted>
        Already made a second account by mistake? Log in to the one you want to keep and ask us to remove the other under Help.
      </Text>

      <Sheet visible={sheet === 'email'} onClose={close} title="Add email and password">
        <Field testID="add-email" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setError(null) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field testID="add-password" label="Password" hint="At least 8 characters, with a letter and a number." value={password} onChangeText={(v) => { setPassword(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        <Field testID="add-password-again" label="Password again" value={again} onChangeText={(v) => { setAgain(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" error={error} />
        <Button testID="add-email-save" label={busy ? 'Saving…' : 'Save and email me a link'} disabled={busy} onPress={saveEmail} />
      </Sheet>

      <Sheet visible={sheet === 'phone'} onClose={close} title="Add a phone number">
        {codeSentTo ? (
          <>
            <Text variant="small" muted>We texted a 6-digit code to {formatPhone(codeSentTo)}.</Text>
            <Field testID="add-phone-code" label="Code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
            <Button testID="add-phone-confirm" label={busy ? 'Checking…' : 'Confirm'} disabled={busy || code.length < 6} onPress={confirmCode} />
          </>
        ) : (
          <>
            <Field testID="add-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={(v) => { setPhone(v); setError(null) }} keyboardType="phone-pad" autoComplete="tel" error={error} />
            <Button testID="add-phone-send" label={busy ? 'Sending…' : 'Send code'} disabled={busy} onPress={sendCode} />
          </>
        )}
      </Sheet>
    </Screen>
  )
}
