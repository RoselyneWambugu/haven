import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Button } from '@/components/Button'
import { Check, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { applicantResend, applicantSignIn, applicantSignUp, openPortalAfterApproval, parseExpiry, pendingApplicant, refreshApplication, submitApplication } from '@/backend/remoteApplication'
import { supabase } from '@/backend/client'
import { ApplyProgress } from '@/components/ApplyProgress'
import { DocumentUpload } from '@/components/DocumentUpload'
import { useDb } from '@/store/db'

/** Applying to join Echo as a therapist, on the real backend: sign in with a phone, send the details, and follow the decision. */
export function RemoteApply() {
  const app = useDb((s) => s.application)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  // Step 1: an email and a password. Applicants sign up with an email only.
  const [mode, setMode] = useState<'signup' | 'sent' | 'login'>(() => (pendingApplicant() ? 'sent' : 'signup'))
  const [email, setEmail] = useState(() => pendingApplicant()?.email ?? '')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [info, setInfo] = useState<string | null>(null)
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

  function entered(r: { therapist: boolean }) {
    if (r.therapist) return router.replace('/portal/today' as never)
    setSignedIn(true)
  }
  async function signUp() {
    if (password !== again) return setError('The two passwords don’t match.')
    setBusy(true)
    const r = await applicantSignUp(email, password)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    if (r.value.next === 'in') return entered({ therapist: r.value.therapist === true })
    setMode('sent')
  }
  async function confirmed() {
    setBusy(true)
    const r = await applicantSignIn(mode === 'login' ? email : undefined, mode === 'login' ? password : undefined)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setError(null)
    entered(r.value)
  }
  async function resend() {
    const r = await applicantResend()
    if (!r.ok) return setError(r.error)
    setError(null)
    setInfo('Sent again. It can take a minute, and it may land in spam.')
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
          <ApplyProgress step={1} />
          <Text variant="title">{mode === 'login' ? 'Log back in to your application' : mode === 'sent' ? 'Confirm your email' : 'Apply to join Echo'}</Text>
          {mode === 'sent' ? (
            <>
              <Text variant="body" muted>
                {`We sent a link to ${email}. Open it to confirm your address, then come back here.`}
              </Text>
              {error ? <Banner tone="clay">{error}</Banner> : null}
              {info ? <Banner tone="green">{info}</Banner> : null}
              <Button testID="apply-confirmed" label={busy ? 'Checking…' : 'I’ve confirmed it'} disabled={busy} onPress={confirmed} />
              <Button testID="apply-resend" variant="quiet" label="Send it again" onPress={resend} />
              <Button variant="ghost" label="Use a different email" onPress={() => { setMode('signup'); setError(null); setInfo(null) }} />
            </>
          ) : (
            <>
              <Text variant="body" muted>
                {mode === 'login'
                  ? 'Use the email and password you made when you started.'
                  : 'Echo is for licensed therapists. Start by making a sign-in with your email. It is the email you will use to sign in to the portal.'}
              </Text>
              <Panel>
                <Field testID="apply-email" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setError(null) }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <Field testID="apply-password" label="Password" hint={mode === 'signup' ? 'At least 8 characters, with a letter and a number.' : undefined} value={password} onChangeText={(v) => { setPassword(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                {mode === 'signup' ? <Field testID="apply-password-again" label="Password again" value={again} onChangeText={(v) => { setAgain(v); setError(null) }} secureTextEntry autoCapitalize="none" autoComplete="new-password" error={error} /> : null}
                {mode === 'login' && error ? <Banner tone="clay">{error}</Banner> : null}
                {mode === 'signup' && error && !/match/.test(error) ? <Banner tone="clay">{error}</Banner> : null}
                {mode === 'signup' ? (
                  <Button testID="apply-send-code" label={busy ? 'Creating…' : 'Continue'} disabled={busy} onPress={signUp} />
                ) : (
                  <Button testID="apply-login" label={busy ? 'Logging in…' : 'Log in'} disabled={busy} onPress={confirmed} />
                )}
              </Panel>
              <Button variant="quiet" label={mode === 'signup' ? 'I already started. Log in' : 'Start a new application'} onPress={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null) }} />
            </>
          )}
          <Button variant="ghost" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
        </View>
      </View>
    )
  }

  const status = app?.status ?? 'none'
  if (status !== 'none' && !editing) {
    return (
      <View testID="apply-status" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 16 }}>
          <Text variant="title">Application status</Text>
          <ApplyProgress step={status === 'pending' || status === 'info' ? 3 : 4} />
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
        <ApplyProgress step={2} />
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
