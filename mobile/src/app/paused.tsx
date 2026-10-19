import { api } from '@/api'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go, resetTo } from '@/lib/nav'

/**
 * Signing in while paused shows a plain status screen, not an error (PRD ACC-18).
 * Urgent help, the help centre, billing, data export and appeal always stay available (SAF-15).
 */
export default function Paused() {
  return (
    <Screen testID="paused" header={<TopBar logo />} footer={<Button label="Sign out" variant="ghost" onPress={() => { api.auth.signOut(); resetTo('/welcome') }} />}>
      <Banner tone="sun" title="Your account is paused">
        Three notices were recorded. Our team is reviewing them. This usually takes a few days.
      </Banner>
      <Text variant="label" muted>
        You can still
      </Text>
      <Row title="Get urgent help" onPress={() => go('/urgent')} />
      <Row title="Read the help centre" onPress={() => go('/help')} />
      <Row title="Manage billing" onPress={() => go('/plan')} />
      <Row title="Download my data" onPress={() => go('/settings/privacy')} />
      <Row title="Appeal this decision" onPress={() => go('/standing')} last />
    </Screen>
  )
}
