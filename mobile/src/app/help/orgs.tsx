import { useState } from 'react'
import { Linking, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { Field } from '@/components/Field'
import { useDb } from '@/store/db'

/** Outside organisations. Details are placeholders until the clinical team verifies them (D29). */
export default function Orgs() {
  const orgs = useDb((s) => s.content.supportOrgs).filter((o) => !o.archived)
  const verified = useDb((s) => s.content.crisisVerifiedAt)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <Screen testID="orgs" header={<TopBar back />}>
      <Text variant="title">Support organisations</Text>
      {verified === null ? (
        <Banner tone="sun" icon="clock" title="Details to be confirmed">
          Names and numbers are checked by our clinical team before launch.
        </Banner>
      ) : null}
      {orgs.map((o) => (
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
      <Text variant="h3" style={{ marginTop: 8 }}>
        Know a service that could help?
      </Text>
      <Text variant="small" muted>
        Suggest it and our clinical team will review it. They check every service before it is listed.
      </Text>
      <Field testID="suggest-name" label="Name of the service" value={name} onChangeText={(v) => { setName(v); setMsg(null) }} />
      <Field testID="suggest-note" label="Anything we should know (optional)" value={note} onChangeText={setNote} multiline minHeight={80} maxLength={300} />
      {msg ? <Banner tone="clay">{msg}</Banner> : null}
      <Button
        testID="suggest-send"
        variant="quiet"
        label="Suggest this service"
        onPress={() => {
          const r = api.suggestService(name, note)
          if (!r.ok) return setMsg(r.error)
          setName('')
          setNote('')
        }}
      />
    </Screen>
  )
}
