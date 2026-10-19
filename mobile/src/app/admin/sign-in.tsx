import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/api'
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
  const roster = useDb((s) => s.admin?.staff) ?? STAFF.map((s, i) => ({ id: `st${i}`, ...s, active: true, lastSignInAt: null }))
  const role = roster.find((s) => s.name === name)?.role ?? 'moderator'

  function submit() {
    const r = api.admin.signIn(name, code)
    if (!r.ok) return setError(r.error)
    router.replace('/admin/overview' as never)
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
