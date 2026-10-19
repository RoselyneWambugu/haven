import { Button } from '@/components/Button'
import { Count } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { EmptyState, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { DEPARTMENTS } from '@/data/help'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

const STATUS = { open: 'Open', replied: 'Replied', resolved: 'Resolved' } as const

export default function Tickets() {
  const tickets = useDb((s) => s.tickets)
  return (
    <Screen testID="tickets" header={<TopBar back />}>
      <Text variant="title">My tickets</Text>
      {tickets.length ? (
        tickets.map((t, i) => (
          <Row
            key={t.id}
            testID={`ticket-${t.id}`}
            title={t.subject}
            sub={`${DEPARTMENTS.find((d) => d.id === t.deptId)?.title} · ${STATUS[t.status]}`}
            right={t.unread ? <Count n={1} /> : undefined}
            onPress={() => go(`/help/ticket/${t.id}`)}
            last={i === tickets.length - 1}
          />
        ))
      ) : (
        <EmptyState icon="ticket" title="No tickets yet" body="When you contact support, your conversation appears here.">
          <Button label="Contact support" onPress={() => go('/help/contact')} />
        </EmptyState>
      )}
    </Screen>
  )
}
