import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'

/**
 * Plain-language summaries of the Terms, Privacy Notice and Community Guidelines (PRD ACC-5).
 * These are placeholders: the real documents need legal review (PRD section 10).
 */
export default function About() {
  return (
    <Screen testID="about" header={<TopBar back />}>
      <Text variant="title">Terms, privacy and guidelines</Text>
      <Banner tone="sun" title="Draft summary">
        The full documents are still being prepared and need legal review. This is a short, plain summary of what they will say.
      </Banner>

      <Text variant="h2">Community guidelines</Text>
      {[
        'Be kind. Everyone here is going through something.',
        'Never share phone numbers, addresses, links or social handles. It keeps everyone anonymous.',
        'Never try to find out who someone is, or share what you know about them.',
        'No threats, harassment, hate or sexual advances.',
        'Echo is peer support, not therapy. Don’t give medical advice or diagnoses.',
        'If you are worried someone is in danger, report it and use Urgent help.',
      ].map((t) => (
        <Text key={t} variant="body">
          • {t}
        </Text>
      ))}

      <Text variant="h2">Privacy notice</Text>
      {[
        'Your name, phone, date of birth and ID are in a private profile. Other members never see them.',
        'Messages are screened by automated tools. Trained staff only read messages that are reported or flagged, and every access is logged.',
        'You can download your data or delete your account at any time.',
        'We never sell your data or show advertising.',
      ].map((t) => (
        <Text key={t} variant="body">
          • {t}
        </Text>
      ))}

      <Text variant="h2">Terms</Text>
      {[
        'You must be 18 or over.',
        'Peer chat needs an active plan. Therapy sessions are priced per session.',
        'You can cancel a plan at any time and keep access until it ends.',
        'Echo is not an emergency service.',
      ].map((t) => (
        <Text key={t} variant="body">
          • {t}
        </Text>
      ))}
    </Screen>
  )
}
