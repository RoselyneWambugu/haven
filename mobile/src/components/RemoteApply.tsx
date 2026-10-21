import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Button } from '@/components/Button'
import { Check, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { applicantRequestOtp, applicantVerifyOtp, openPortalAfterApproval, parseExpiry, refreshApplication, submitApplication } from '@/backend/remoteApplication'
import { supabase } from '@/backend/client'
import { normaliseKenyanPhone } from '@/lib/identity'
import { DocumentUpload } from '@/components/DocumentUpload'
import { useDb } from '@/store/db'

const STEPS = ['Submitted', 'Under review', 'Decision'] as const

/** Applying to join Echo as a therapist, on the real backend: sign in with a phone, send the details, and follow the decision. */
export function RemoteApply() {
  const app = useDb((s) => s.application)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('Counsellor')
  const [gender, setGender] = useState<'woman' | 'man' | null>(null)
  const [licence, setLicence] = useState('')
  const [expiry, setExpiry] = useState('')
  const [consentPublic, setConsentPublic] = useState(false)
  const [consentConduct, setConsentConduct] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void supabase().auth.getSession().then(async ({ data }) => {
      const ok = !!data.session
      setSignedIn(ok)
      if (ok) await refreshApplication()
    })
  }, [])

  async function send() {
    const n = normaliseKenyanPhone(phone)
    if (!n) return setError('Enter a Kenyan mobile number, like 0712 345 678.')
    setBusy(true)
    const r = await applicantRequestOtp(n)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setSent(true)
  }
  async function verify() {
    setBusy(true)
    const r = await applicantVerifyOtp(code)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    if (r.value.therapist) return router.replace('/portal/today' as never)
    setSignedIn(true)
  }
  async function submit() {
    const exp = parseExpiry(expiry)
    if (!exp) return setError('Write the expiry date as year-month-day, like 2027-03-31.')
    if (!gender) return setError('Choose one so members can filter by it.')
    setBusy(true)
    const r = await submitApplication({ name, title, gender, licenceNumber: licence, licenceExpiry: exp, consentPublic, consentConduct })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    setEditing(false)
  }

  if (!signedIn) {
    return (
      <View testID="apply-signin" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 520, gap: 16 }}>
          <Text variant="title">Apply to join Echo</Text>
          <Text variant="body" muted>
            Echo is for licensed therapists. Start by confirming your phone number. It is the number you will use to sign in to the portal.
          </Text>
          <Panel>
            {sent ? (
              <>
                <Field testID="apply-code" label="Code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
                <Button testID="apply-verify" label="Continue" disabled={busy || code.length < 6} onPress={verify} />
                <Button variant="ghost" label="Use a different number" onPress={() => { setSent(false); setCode(''); setError(null) }} />
              </>
            ) : (
              <>
                <Field testID="apply-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={(v) => { setPhone(v); setError(null) }} keyboardType="phone-pad" error={error} />
                <Button testID="apply-send-code" label="Send code" disabled={busy} onPress={send} />
              </>
            )}
          </Panel>
          <Button variant="ghost" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
        </View>
      </View>
    )
  }

  const status = app?.status ?? 'none'
  if (status !== 'none' && !editing) {
    const stepIndex = status === 'pending' || status === 'info' ? 1 : 2
    return (
      <View testID="apply-status" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 16 }}>
          <Text variant="title">Application status</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, gap: 6 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= stepIndex ? '#3F6B4A' : '#C3D6A8' }} />
                <Text variant="caption" bold={i === stepIndex}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
          {status === 'pending' ? (
            <Banner tone="green" icon="clock" title="Under review">
              The clinical team is checking your licence with the regulator. We will show the decision here.
            </Banner>
          ) : null}
          {status === 'info' ? (
            <Panel tone="sun" testID="more-info">
              <Text variant="label">More information needed</Text>
              <Text variant="small">{app?.message}</Text>
              <Button testID="reupload" label="Update my details" onPress={() => { setName(app?.name ?? ''); setEditing(true) }} />
            </Panel>
          ) : null}
          {status === 'rejected' ? (
            <Banner tone="clay" title="We couldn’t approve this application">
              {app?.message}
            </Banner>
          ) : null}
          {status === 'approved' ? (
            <>
              <Banner tone="green" icon="check" title="You’re approved">
                {app?.message} Build your public profile and set your availability. New clients can’t book you until you switch your calendar on.
              </Banner>
              <Button testID="start-portal" label="Open the portal" onPress={async () => { if (await openPortalAfterApproval()) router.replace('/portal/today' as never) }} />
            </>
          ) : null}
          <Button variant="ghost" label="Refresh" onPress={() => void refreshApplication()} />
          <Button variant="quiet" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
        </View>
      </View>
    )
  }

  return (
    <View testID="apply" style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 560, padding: 24, gap: 16 }}>
        <Text variant="title">Professional details</Text>
        <Field testID="apply-name" label="Full name (shown publicly)" value={name} onChangeText={setName} />
        <Field testID="apply-title" label="Title, for example Counsellor or Psychologist" value={title} onChangeText={setTitle} />
        <Text variant="small" muted>
          Members can filter therapists by gender
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip testID="gender-woman" label="Woman" selected={gender === 'woman'} onPress={() => setGender('woman')} />
          <Chip testID="gender-man" label="Man" selected={gender === 'man'} onPress={() => setGender('man')} />
        </View>
        <Text variant="small" muted>
          Registering body: Counsellors and Psychologists Board
        </Text>
        <Field testID="apply-licence" label="Licence number" value={licence} onChangeText={setLicence} />
        <Field testID="apply-expiry" label="Licence expiry (year-month-day)" placeholder="2027-03-31" value={expiry} onChangeText={setExpiry} />
        <Panel title="Documents">
          <Text variant="small" muted>
            The clinical team checks these with the regulator. Only they can open them. PDF, JPEG or PNG, up to 5 MB each. A licence document is needed before you can be approved.
          </Text>
          <DocumentUpload kind="licence" label="Licence or registration certificate" />
          <DocumentUpload kind="id" label="National ID" />
          <DocumentUpload kind="qualification" label="Qualification certificate" />
        </Panel>
        <Check testID="consent-public" checked={consentPublic} label="I understand my name and qualifications will be public on Echo." onPress={() => setConsentPublic((v) => !v)} />
        <Check testID="consent-conduct" checked={consentConduct} label="I accept the Therapist Code of Conduct and the crisis escalation protocol." onPress={() => setConsentConduct((v) => !v)} />
        {error ? <Banner tone="clay">{error}</Banner> : null}
        <Button testID="apply-submit" label="Submit application" disabled={busy} onPress={submit} />
        <Button variant="ghost" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
      </View>
    </View>
  )
}
