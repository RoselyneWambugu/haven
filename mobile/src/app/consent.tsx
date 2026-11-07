import { useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Check } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go, resetTo } from '@/lib/nav'
import { colors } from '@/theme'

/** A separate link, so tapping a checkbox label never opens a page by accident. */
function ReadLink({ label }: { label: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => go('/about')} style={{ marginLeft: 34, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * Step 5 of 5, the last step: four separate consents (PRD ACC-5). Message screening has its own box, because
 * people should be able to see and understand it on its own. Saying yes here creates the profile.
 */
export default function Consent() {
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [guidelines, setGuidelines] = useState(false)
  const [screening, setScreening] = useState(false)
  const all = terms && privacy && guidelines && screening
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Screen
      testID="consent"
      keyboard
      header={<TopBar back />}
      footer={
        <>
          {error ? <Banner tone="clay">{error}</Banner> : null}
          <Button
            testID="finish"
            label={busy ? 'Creating your profile…' : 'Finish'}
            disabled={!all || busy}
            onPress={async () => {
              setBusy(true)
              api.auth.acceptConsents()
              const r = await api.auth.completeRegistration(Platform.OS)
              setBusy(false)
              if (!r.ok) return setError(r.error)
              resetTo('/home')
            }}
          />
          <Text variant="caption" muted align="center">
            You can withdraw consent in Settings. Some features may stop.
          </Text>
        </>
      }
    >
      <Text variant="caption" muted>
        Step 5 of 5
      </Text>
      <Text variant="title">Last step: your privacy, your choice</Text>
      <Banner tone="green" icon="lock" title="Others never see your real name.">
        They see only your pen name and avatar. Your details stay in a private profile.
      </Banner>
      <View style={{ gap: 6 }}>
        <Check testID="consent-terms" checked={terms} onPress={() => setTerms((v) => !v)} label="I am 18 or over and accept the Terms" />
        <ReadLink label="Read the Terms" />
        <Check testID="consent-privacy" checked={privacy} onPress={() => setPrivacy((v) => !v)} label="I have read the Privacy Notice" />
        <ReadLink label="Read the Privacy Notice" />
        <Check testID="consent-guidelines" checked={guidelines} onPress={() => setGuidelines((v) => !v)} label="I agree to the Community Guidelines: no phone numbers, addresses or links" />
        <ReadLink label="Read the Community Guidelines" />
        <Check testID="consent-screening" checked={screening} onPress={() => setScreening((v) => !v)} label="I agree to message screening">
          <Text variant="small">
            <Text variant="small" bold>Message screening.</Text> Automated tools check messages for abuse and safety risks. Trained staff may review only messages that are reported or flagged.
          </Text>
        </Check>
      </View>
    </Screen>
  )
}
