import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { REMOTE } from '@/backend/client'
import { portalRequestOtp, portalVerifyOtp } from '@/backend/remotePortal'
import { THERAPISTS } from '@/data/seed'
import { normaliseKenyanPhone } from '@/lib/identity'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

/** Therapists sign in separately from members. On the real backend that is a phone number and a code; the demo signs in as one seeded therapist. */
export default function PortalSignIn() {
  const app = useDb((s) => s.portal?.application ?? 'none')
  const demo = THERAPISTS.find((t) => t.id === 't-amina') ?? THERAPISTS[0]
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    const n = normaliseKenyanPhone(phone)
    if (!n) return setError('Enter a Kenyan mobile number, like 0712 345 678.')
    setBusy(true)
    const r = await portalRequestOtp(n)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSent(true)
  }

  async function verify() {
    setBusy(true)
    const r = await portalVerifyOtp(code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    router.replace('/portal/today' as never)
  }

  return (
    <View testID="portal-sign-in" style={{ flex: 1, alignItems: 'center', padding: 24, paddingTop: 48 }}>
      <View style={{ width: '100%', maxWidth: 460, gap: 18 }}>
        <Text variant="display">Welcome back</Text>
        <Text variant="body" muted>
          Echo is for licensed therapists. Clients are anonymous: you see a pen name and avatar only.
        </Text>
        {REMOTE ? (
          <Panel tone="lichen">
            <Text variant="label">Sign in with your phone</Text>
            <Text variant="small">Use the number Echo has linked to your therapist account.</Text>
            {sent ? (
              <>
                <Field testID="portal-code" label="Code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
                <Button testID="portal-verify" label="Sign in" disabled={busy || code.length < 6} onPress={verify} />
                <Button variant="ghost" label="Use a different number" onPress={() => { setSent(false); setCode(''); setError(null) }} />
              </>
            ) : (
              <>
                <Field testID="portal-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={(v) => { setPhone(v); setError(null) }} keyboardType="phone-pad" error={error} />
                <Button testID="portal-send-code" label="Send code" disabled={busy} onPress={send} />
              </>
            )}
            <Banner tone="green" icon="lock">
              Only a number Echo has linked to a therapist account can open the portal.
            </Banner>
          </Panel>
        ) : (
          <Panel tone="lichen">
            <Text variant="label">Demo</Text>
            <Text variant="small">Real sign-in uses your phone and a code. For this demo, continue as a seeded therapist.</Text>
            <Button
              testID="portal-demo-sign-in"
              label={`Continue as ${demo.name}`}
              onPress={() => {
                api.portal.signIn()
                router.replace('/portal/today' as never)
              }}
            />
          </Panel>
        )}
        <Button testID="portal-apply" variant="quiet" label={app === 'none' ? 'Apply to join Echo' : 'See my application'} onPress={() => go('/portal/apply')} />
        <Button variant="ghost" label="Back to the member app" onPress={() => router.replace('/welcome' as never)} />
      </View>
    </View>
  )
}
