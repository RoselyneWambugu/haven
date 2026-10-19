import { useState } from 'react'
import { Pressable } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go, replace } from '@/lib/nav'
import { colors } from '@/theme'

export default function Register() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [why, setWhy] = useState(false)

  function submit() {
    const r = api.auth.submitDetails({ fullName, phone, dob, email })
    if (!r.ok) {
      if (r.code === 'under-18') return replace('/under-18')
      return setErrors({ [r.code ?? 'form']: r.error })
    }
    const otp = api.auth.requestOtp('register')
    if (!otp.ok) return setErrors({ form: otp.error })
    go('/otp?purpose=register')
  }

  return (
    <Screen
      testID="register"
      keyboard
      header={<TopBar back />}
      footer={<Button testID="register-continue" label="Continue" onPress={submit} />}
    >
      <Text variant="caption" muted>
        Step 2 of 5
      </Text>
      <Text variant="title">Your details</Text>
      <Banner tone="green" icon="lock">
        This stays private. Others only ever see your pen name and avatar.
      </Banner>
      <Field testID="reg-name" label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" autoCapitalize="words" error={errors.name} />
      <Field testID="reg-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" error={errors.phone} />
      <Field testID="reg-dob" label="Date of birth" placeholder="DD / MM / YYYY" value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation" hint="Used to check you are 18 or over and to find an age range. Others never see it." error={errors.dob} />
      <Field testID="reg-email" label="Email (optional)" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errors.email} />
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
          <Text variant="small" bold>Phone.</Text> To send you a code to sign in. One account per number.
        </Text>
        <Text variant="small">
          <Text variant="small" bold>Date of birth.</Text> Echo is for adults. We use it to check your age and to find people in a similar age range. Others see only the range, never the date.
        </Text>
        <Text variant="small">
          <Text variant="small" bold>Email.</Text> Optional. Only used for receipts and to help you recover your account.
        </Text>
      </Sheet>
    </Screen>
  )
}
