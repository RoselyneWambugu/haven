import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Check, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { REMOTE } from '@/backend/client'
import { ApplyProgress } from '@/components/ApplyProgress'
import { RemoteApply } from '@/components/RemoteApply'
import { passwordProblem, validEmail } from '@/lib/password'
import { useDb } from '@/store/db'

/** The code the demo shows on screen, since no text is really sent. */
const DEMO_CODE = '135790'

/** Application and verification (PRD THR-1, THR-2). Documents are for reviewers only. The profile is public, and consent says so. */
export default function Apply() {
  if (REMOTE) return <RemoteApply />
  return <MockApply />
}

function MockApply() {
  const app = useDb((s) => s.portal?.application ?? 'none')
  const [docs, setDocs] = useState<string[]>([])
  const [consentPublic, setConsentPublic] = useState(false)
  const [consentConduct, setConsentConduct] = useState(false)
  const [name, setName] = useState('')
  const [licence, setLicence] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Step 1: the phone number the therapist will sign in with. The demo sends no real text; it shows the code.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [verified, setVerified] = useState(false)
  const toggle = (d: string) => setDocs((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))

  if (app !== 'none') {
    return (
      <View testID="apply-status" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 16 }}>
          <Text variant="title">Application status</Text>
          <ApplyProgress step={app === 'submitted' || app === 'more-info' ? 3 : 4} />
          {app === 'submitted' ? (
            <Banner tone="green" icon="clock" title="Under review">
              The clinical team is checking your licence with the regulator. Typical review time: ___ working days (placeholder).
            </Banner>
          ) : null}
          {app === 'more-info' ? (
            <Panel tone="sun" testID="more-info">
              <Text variant="label">More information needed</Text>
              <Text variant="small">“Please upload a clearer copy of your licence. The expiry date isn’t readable.”</Text>
              <Button testID="reupload" label="Upload a new copy" onPress={() => api.portal.resubmit()} />
            </Panel>
          ) : null}
          {app === 'approved' ? (
            <Banner tone="green" icon="check" title="You’re approved">
              Build your public profile and set your availability. We’ll remind you 60 days before your licence expires.
            </Banner>
          ) : null}
          {app === 'approved' ? <Button testID="start-portal" label="Open the portal" onPress={() => { api.portal.signIn(); router.replace('/portal/today' as never) }} /> : null}
          {app !== 'approved' ? <Button testID="advance-review" variant="ghost" label="Demo: move the review along" onPress={() => api.portal.advanceReview()} /> : null}
          <Button variant="quiet" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
        </View>
      </View>
    )
  }

  function sendCode() {
    if (!validEmail(email.trim())) return setError('Enter your email address, like name@example.com.')
    const problem = passwordProblem(password, email)
    if (problem) return setError(problem)
    if (password !== again) return setError('The two passwords don’t match.')
    setError(null)
    setSent(true)
  }
  function verifyCode() {
    if (code !== DEMO_CODE) return setError('That code doesn’t match.')
    setError(null)
    setVerified(true)
  }

  if (!verified) {
    return (
      <View testID="apply-signin" style={{ flex: 1, alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 520, gap: 16 }}>
          <ApplyProgress step={1} />
          <Text variant="title">Apply to join Echo</Text>
          <Text variant="body" muted>
            Echo is for licensed therapists. Start by making a sign-in with your email. It is the email you will use to sign in to the portal.
          </Text>
          <Panel>
            {sent ? (
              <>
                <Text variant="small" muted>
                  {`We emailed a 6-digit code to ${email.trim()}.`}
                </Text>
                <Banner tone="sun" icon="lock" title="Demo code">
                  {DEMO_CODE}
                </Banner>
                <Field testID="apply-code" label="Code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(null) }} keyboardType="number-pad" maxLength={6} error={error} />
                <Button testID="apply-verify" label="Continue" disabled={code.length < 6} onPress={verifyCode} />
                <Button variant="ghost" label="Use a different email" onPress={() => { setSent(false); setCode(''); setError(null) }} />
              </>
            ) : (
              <>
                <Field testID="apply-email" label="Email" placeholder="you@example.com" value={email} onChangeText={(v) => { setEmail(v); setError(null) }} keyboardType="email-address" autoCapitalize="none" />
                <Field testID="apply-password" label="Password" hint="At least 8 characters, with a letter and a number." value={password} onChangeText={(v) => { setPassword(v); setError(null) }} secureTextEntry autoCapitalize="none" />
                <Field testID="apply-password-again" label="Password again" value={again} onChangeText={(v) => { setAgain(v); setError(null) }} secureTextEntry autoCapitalize="none" error={error} />
                <Button testID="apply-send-code" label="Continue" onPress={sendCode} />
              </>
            )}
          </Panel>
          <Button variant="ghost" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
        </View>
      </View>
    )
  }

  function submit() {
    if (!name.trim() || !licence.trim()) return setError('Add your name and licence number.')
    if (!docs.includes('licence') || !docs.includes('id') || !docs.includes('qualification')) return setError('Add your licence, national ID and qualification certificate.')
    if (!consentPublic || !consentConduct) return setError('Please accept both statements to continue.')
    api.portal.submitApplication()
  }

  return (
    <View testID="apply" style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 560, padding: 24, gap: 16 }}>
        <ApplyProgress step={2} />
        <Text variant="title">Professional details and documents</Text>
        <Field testID="apply-name" label="Full name (shown publicly)" value={name} onChangeText={setName} />
        <Text variant="small" muted>
          Registering body
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="Counsellors and Psychologists Board" selected />
        </View>
        <Field testID="apply-licence" label="Licence number" value={licence} onChangeText={setLicence} />
        <Text variant="small" muted>
          Documents (reviewers only, never public)
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip testID="doc-licence" label="Licence" icon={docs.includes('licence') ? 'check' : 'plus'} selected={docs.includes('licence')} onPress={() => toggle('licence')} />
          <Chip testID="doc-id" label="National ID" icon={docs.includes('id') ? 'check' : 'plus'} selected={docs.includes('id')} onPress={() => toggle('id')} />
          <Chip testID="doc-qualification" label="Qualification certificate" icon={docs.includes('qualification') ? 'check' : 'plus'} selected={docs.includes('qualification')} onPress={() => toggle('qualification')} />
        </View>
        <Check testID="consent-public" checked={consentPublic} label="I understand my name, photo and qualifications will be public on Echo." onPress={() => setConsentPublic((v) => !v)} />
        <Check testID="consent-conduct" checked={consentConduct} label="I accept the Therapist Code of Conduct and the crisis escalation protocol." onPress={() => setConsentConduct((v) => !v)} />
        {error ? <Banner tone="clay">{error}</Banner> : null}
        <Button testID="apply-submit" label="Submit application" onPress={submit} />
        <Button variant="ghost" label="Back" onPress={() => router.replace('/portal/sign-in' as never)} />
      </View>
    </View>
  )
}
