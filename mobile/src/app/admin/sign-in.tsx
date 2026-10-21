import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/api'
import { REMOTE } from '@/backend/client'
import { adminRequestOtp, adminVerifyOtp } from '@/backend/remoteAdmin'
import { normaliseKenyanPhone } from '@/lib/identity'
import { DEMO_MFA, STAFF } from '@/api/admin'
import { useDb } from '@/store/db'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ROLE_LABEL } from '@/lib/admin'

/** Staff sign in with a second factor. For the demo, pick a staff member and use the code shown. */
export default function AdminSignIn() {
  const [name, setName] = useState('T. Njeri')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const roster = useDb((s) => s.admin?.staff) ?? STAFF.map((s, i) => ({ id: `st${i}`, ...s, active: true, lastSignInAt: null }))
  const role = roster.find((s) => s.name === name)?.role ?? 'moderator'

  function submit() {
    const r = api.admin.signIn(name, code)
    if (!r.ok) return setError(r.error)
    router.replace('/admin/overview' as never)
  }

  async function send() {
    const n = normaliseKenyanPhone(phone)
    if (!n) return setError('Enter a Kenyan mobile number, like 0712 345 678.')
    setBusy(true)
    const r = await adminRequestOtp(n)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSent(true)
  }

  async function verify() {
    setBusy(true)
    const r = await adminVerifyOtp(code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    router.replace('/admin/overview' as never)
  }

  if (REMOTE) {
    return (
      <View testID="admin-sign-in" style={{ flex: 1, alignItems: 'center', padding: 24, paddingTop: 40 }}>
        <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
          <Text variant="display">Staff sign-in</Text>
          <Text variant="body" muted>
            Internal use only. Everything you do here is logged.
          </Text>
          <Panel title="Sign in with your phone">
            {sent ? (
              <>
                <Field testID="admin-code" label="Code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
                <Button testID="admin-verify" label="Sign in" disabled={busy || code.length < 6} onPress={verify} />
                <Button variant="ghost" label="Use a different number" onPress={() => { setSent(false); setCode(''); setError(null) }} />
              </>
            ) : (
              <>
                <Field testID="admin-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={(v) => { setPhone(v); setError(null) }} keyboardType="phone-pad" error={error} />
                <Button testID="admin-send-code" label="Send code" disabled={busy} onPress={send} />
              </>
            )}
          </Panel>
          <Banner tone="green" icon="lock">
            Only a number an Admin has linked to a staff account can open the dashboard.
          </Banner>
          <Button variant="ghost" label="Back to the member app" onPress={() => router.replace('/welcome' as never)} />
        </View>
      </View>
    )
  }

  return (
    <View testID="admin-sign-in" style={{ flex: 1, alignItems: 'center', padding: 24, paddingTop: 40 }}>
      <View style={{ width: '100%', maxWidth: 480, gap: 16 }}>
        <Text variant="display">Staff sign-in</Text>
        <Text variant="body" muted>
          Internal use only. Everything you do here is logged.
        </Text>
        <Panel title="Who are you? (demo)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {roster.map((s) => (
              <Chip key={s.name} testID={`staff-${s.name}`} label={s.name} selected={name === s.name} onPress={() => setName(s.name)} />
            ))}
          </View>
          <Text variant="small" muted>
            You’ll sign in as {ROLE_LABEL[role]}.
          </Text>
        </Panel>
        <Banner tone="sun" icon="lock" title="Demo code">
          {DEMO_MFA}
        </Banner>
        <Field testID="mfa-code" label="Second-factor code" value={code} onChangeText={(v) => { setCode(v); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
        <Button testID="admin-sign-in-go" label="Sign in" onPress={submit} />
        <Button variant="ghost" label="Back to the member app" onPress={() => router.replace('/welcome' as never)} />
      </View>
    </View>
  )
}
