import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { REMOTE } from '@/backend/client'
import { setPendingSignup } from '@/backend/pendingSignup'
import { GoogleButton } from '@/components/GoogleButton'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { getDb, useDb } from '@/store/db'
import { go, replace } from '@/lib/nav'
import { registrationRoute } from '@/lib/registration'
import { colors } from '@/theme'

/**
 * Step 1 of 5: your details. Everyone signs up with an email address (or Google, which is an email too). Step 2 confirms the email,
 * then a pen name, languages, and last the terms.
 */
export default function Register() {
  const [fullName, setFullName] = useState(() => getDb().reg?.fullName ?? '')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState(() => getDb().reg?.email ?? '')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [why, setWhy] = useState(false)
  const [busy, setBusy] = useState(false)
  // Someone who already proved their email (Google, or a link they opened) has no password to make; Google also tells us who they are.
  const verified = useDb((s) => s.reg?.verified === true)
  const knownEmail = useDb((s) => s.reg?.email ?? '')
  const knownName = useDb((s) => s.reg?.fullName ?? '')
  useEffect(() => {
    if (!verified) return
    setFullName((v) => v || knownName)
    setEmail((v) => v || knownEmail)
  }, [verified, knownName, knownEmail])

  async function submit() {
    if (!verified && password !== again) return setErrors({ again: 'The two passwords don’t match.' })
    const r = api.auth.submitDetails({ fullName, dob, email, password: verified ? null : password })
    if (!r.ok) {
      if (r.code === 'under-18') return replace('/under-18')
      return setErrors({ [r.code ?? 'form']: r.error })
    }
    setErrors({})
    if (verified) return go('/pen-name')
    if (REMOTE) {
      // Make the account, then ask for the email to be confirmed. With confirmation switched off there is a session at once and no step 2.
      setBusy(true)
      const s = await api.auth.signUpWithEmail(email, password)
      setBusy(false)
      if (!s.ok) return setErrors({ [s.code === 'email' || s.code === 'password' ? s.code : 'form']: s.error })
      if (s.value.next === 'check-email') {
        setPendingSignup(email, password)
        return go('/check-email')
      }
      return replace(registrationRoute(getDb().reg))
    }
    // The demo has no inbox: it shows the code on screen.
    const otp = await api.auth.requestOtp('register')
    if (!otp.ok) return setErrors({ form: otp.error })
    go('/otp?purpose=register')
  }

  return (
    <Screen
      testID="register"
      keyboard
      header={<TopBar back />}
      footer={<Button testID="register-continue" label={busy ? 'Creating…' : 'Continue'} disabled={busy} onPress={submit} />}
    >
      <Text variant="caption" muted>
        Step 1 of 5
      </Text>
      <Text variant="title">Your details</Text>
      <Banner tone="green" icon="lock">
        This stays private. Others only ever see your pen name and avatar.
      </Banner>
      {verified ? null : (
        <GoogleButton purpose="register" label="Sign up with Google instead" onNext={(next) => { if (next === 'trust-device') replace('/trust-device'); else replace(registrationRoute(getDb().reg)) }} />
      )}
      <Field testID="reg-name" label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" autoCapitalize="words" error={errors.name} />
      {verified ? (
        <Banner tone="green" icon="shield">
          Your email{knownEmail ? ` (${knownEmail})` : ''} is confirmed. Just add the rest.
        </Banner>
      ) : (
        <>
          <Field testID="reg-email" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setErrors({}) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errors.email} />
          <Field testID="reg-password" label="Password" hint="At least 8 characters, with a letter and a number." value={password} onChangeText={(v) => { setPassword(v); setErrors({}) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={errors.password} />
          <Field testID="reg-password-again" label="Password again" value={again} onChangeText={(v) => { setAgain(v); setErrors({}) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" error={errors.again} />
        </>
      )}
      <Field testID="reg-dob" label="Date of birth" placeholder="DD / MM / YYYY" value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation" hint="Used to check you are 18 or over and to find people in a similar age range. Others see only the range." error={errors.dob} />
      {errors.form ? <Banner tone="clay">{errors.form}</Banner> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Why do we ask for this?" onPress={() => setWhy(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
          Why do we ask for this?
        </Text>
      </Pressable>
      <Sheet visible={why} onClose={() => setWhy(false)} title="Why we ask">
        <Text variant="small">
          <Text variant="small" bold>Name.</Text> To make sure each person is real and to keep accounts safe. It is never shown to anyone.
        </Text>
        <Text variant="small">
          <Text variant="small" bold>Email and password.</Text> To make your account, to send you a link to confirm it and to let you sign back in. One account per email.
        </Text>
        <Text variant="small">
          <Text variant="small" bold>Date of birth.</Text> Echo is for adults. We use it to check your age and to find people in a similar age range. Others see only the range, never the date.
        </Text>
        <Text variant="small">
          <Text variant="small" bold>No phone number.</Text> We only ask for one if you pay by M-Pesa, and only for that payment.
        </Text>
      </Sheet>
    </Screen>
  )
}
