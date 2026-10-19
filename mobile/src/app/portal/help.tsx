import { Panel, PortalPage } from '@/components/Portal'
import { Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'

export default function PortalHelp() {
  return (
    <PortalPage testID="portal-help" title="Help" sub="For therapists on Echo.">
      <Panel title="In a session">
        <Text variant="small">If anyone may be in danger, use “Raise a concern” in the session. It alerts the on-call clinical lead at once. Stay with the client and share crisis lines.</Text>
        <Row icon="flag" title="Raise a concern now" onPress={() => go('/portal/concern')} last />
      </Panel>
      <Panel title="Good to know">
        <Text variant="small">Clients are anonymous. You see a pen name and avatar only, and you can’t share contact details or links.</Text>
        <Text variant="small">Calls are never recorded. Your private notes are visible only to you.</Text>
        <Text variant="small">Changing time off tells booked clients automatically and offers them a new time.</Text>
      </Panel>
      <Panel title="Contact">
        <Text variant="small">Therapist support replies in the portal within a working day. Peer consultation with the clinical lead isn’t built yet.</Text>
      </Panel>
    </PortalPage>
  )
}
