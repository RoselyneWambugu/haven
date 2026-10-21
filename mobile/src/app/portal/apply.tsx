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
import { RemoteApply } from '@/components/RemoteApply'
import { useDb } from '@/store/db'

const STEPS = ['Submitted', 'Under review', 'Decision'] as const

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
  const toggle = (d: string) => setDocs((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))

  if (app !== 'none') {
    const stepIndex = app === 'submitted' ? 1 : app === 'more-info' ? 1 : 2
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

  function submit() {
    if (!name.trim() || !licence.trim()) return setError('Add your name and licence number.')
    if (!docs.includes('licence') || !docs.includes('id') || !docs.includes('qualification')) return setError('Add your licence, national ID and qualification certificate.')
    if (!consentPublic || !consentConduct) return setError('Please accept both statements to continue.')
    api.portal.submitApplication()
  }

  return (
    <View testID="apply" style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 560, padding: 24, gap: 16 }}>
        <Text variant="caption" muted>
          Step 2 of 4
        </Text>
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
