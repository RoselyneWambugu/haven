import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { submitLicenceRenewal } from '@/backend/remotePortal'
import { parseExpiry } from '@/backend/remoteApplication'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'

/** Renewing a licence on the real backend: send the new number and expiry, and a clinical reviewer checks it with the regulator. */
export function LicenceRenewal() {
  const lic = useDb((s) => s.portal?.licence)
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = lic?.renewal?.status === 'pending'

  async function send() {
    const exp = parseExpiry(expiry)
    if (!exp) return setError('Write the expiry date as year-month-day, like 2028-03-31.')
    setBusy(true)
    const r = await submitLicenceRenewal(number, exp)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setNumber('')
    setExpiry('')
  }

  return (
    <Panel title="Renew your licence" testID="licence-renewal">
      {pending ? (
        <Banner tone="green" icon="clock" title="Your renewal is with a reviewer">
          New expiry {dayLong(lic!.renewal!.newExpiry)}. You will see the answer here.
        </Banner>
      ) : (
        <>
          {lic?.renewal?.status === 'rejected' ? (
            <Banner tone="sun" icon="shield" title="Your last renewal wasn’t accepted">
              {lic.renewal.note}
            </Banner>
          ) : null}
          <Text variant="small" muted>
            Send the licence number and new expiry date from your renewed certificate.
          </Text>
          <Field testID="renew-number" label="Licence number" value={number} onChangeText={(v) => { setNumber(v); setError(null) }} />
          <Field testID="renew-expiry" label="New expiry (year-month-day)" placeholder="2028-03-31" value={expiry} onChangeText={(v) => { setExpiry(v); setError(null) }} error={error} />
          <View style={{ flexDirection: 'row' }}>
            <Button testID="renew-send" label="Send renewal" disabled={busy} onPress={send} />
          </View>
        </>
      )}
    </Panel>
  )
}
