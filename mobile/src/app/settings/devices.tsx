import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { relative } from '@/lib/time'
import { useDb } from '@/store/db'

/** A stable empty list, so a selector that falls back to it doesn't look like a change on every render. */
const NONE: never[] = []

export default function Devices() {
  const devices = useDb((s) => s.account?.devices ?? NONE)
  return (
    <Screen testID="devices" header={<TopBar back title="Devices" />}>
      <Text variant="title">Where you’re signed in</Text>
      {devices.map((d) => (
        <Card key={d.id}>
          <Text variant="h3">{d.name}</Text>
          <Text variant="small" muted>
            {d.approxPlace} · {d.current ? 'active now' : relative(d.lastActiveAt, now()) + ' ago'}
          </Text>
          {d.current ? (
            <Badge label="This device" />
          ) : (
            <Button size="sm" variant="dangerGhost" label="Sign out" onPress={() => api.account.signOutDevice(d.id)} />
          )}
        </Card>
      ))}
      {devices.length > 1 ? <Button variant="quiet" label="Sign out everywhere else" onPress={() => api.account.signOutOthers()} /> : null}
    </Screen>
  )
}
