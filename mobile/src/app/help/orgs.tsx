import { Linking, View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { SUPPORT_ORGS } from '@/data/help'

/** Outside organisations. Details are placeholders until the clinical team verifies them (D29). */
export default function Orgs() {
  return (
    <Screen testID="orgs" header={<TopBar back />}>
      <Text variant="title">Support organisations</Text>
      <Banner tone="sun" icon="clock" title="Details to be confirmed">
        These are placeholders. Names and numbers are checked by our clinical team before launch.
      </Banner>
      {SUPPORT_ORGS.map((o) => (
        <Card key={o.id}>
          <Text variant="h3">{o.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8, flexWrap: 'wrap' }}>
            <Badge label={o.type} />
            <Badge label={o.cost} tone="plain" />
          </View>
          <Text variant="small" muted>
            {o.hours} · {o.languages}
          </Text>
          <View style={{ marginTop: 10 }}>
            <Button
              variant="quiet"
              size="sm"
              disabled={!o.value}
              label={o.value ? (o.action === 'call' ? 'Call' : o.action === 'web' ? 'Open website' : 'Contact') : 'Details coming'}
              onPress={() => Linking.openURL(o.action === 'call' ? `tel:${o.value}` : o.value)}
            />
          </View>
        </Card>
      ))}
    </Screen>
  )
}
