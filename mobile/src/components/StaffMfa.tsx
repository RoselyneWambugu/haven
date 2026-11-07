import { useEffect, useState } from 'react'
import { Image, Platform } from 'react-native'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { adminMfaEnroll, adminMfaFactor, adminMfaVerify } from '@/backend/remoteAdmin'

/**
 * The second step of a staff sign-in: the 6-digit code from an authenticator app. The first time, the person sets the app up
 * (a QR code to scan, or a key to type in) and enters the first code to prove it works.
 */
export function StaffMfa({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const f = await adminMfaFactor()
      if (f) {
        setFactorId(f.factorId)
      } else {
        const r = await adminMfaEnroll()
        if (r.ok) {
          setFactorId(r.value.factorId)
          setSetup({ qr: r.value.qr, secret: r.value.secret })
        } else setError(r.error)
      }
      setReady(true)
    })()
  }, [])

  async function verify() {
    if (!factorId) return
    setBusy(true)
    const r = await adminMfaVerify(factorId, code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onDone()
  }

  return (
    <Panel title={setup ? 'Set up your authenticator app' : 'Enter your authenticator code'} testID="staff-mfa">
      {setup ? (
        <>
          <Text variant="small">
            Staff sign in with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or similar). Add Echo to it once:
          </Text>
          {Platform.OS === 'web' ? <Image testID="mfa-qr" accessibilityLabel="QR code to scan with your authenticator app" source={{ uri: setup.qr }} style={{ width: 200, height: 200, alignSelf: 'center' }} /> : null}
          <Text variant="small" muted>
            Can’t scan? Type this key into the app instead:
          </Text>
          <Text testID="mfa-secret" variant="label" selectable>
            {setup.secret}
          </Text>
          <Text variant="small">Then enter the 6-digit code the app shows.</Text>
        </>
      ) : ready && factorId ? (
        <Text variant="small">Open your authenticator app and enter the 6-digit code for Echo.</Text>
      ) : null}
      {ready ? (
        <>
          <Field testID="mfa-code-input" label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
          <Button testID="mfa-verify" label={setup ? 'Finish setup and sign in' : 'Sign in'} disabled={busy || !factorId || code.length < 6} onPress={verify} />
        </>
      ) : error ? null : (
        <Text variant="small" muted>One moment…</Text>
      )}
      {!ready && error ? <Banner tone="clay">{error}</Banner> : null}
      <Button variant="ghost" label="Use a different account" onPress={onCancel} />
    </Panel>
  )
}
