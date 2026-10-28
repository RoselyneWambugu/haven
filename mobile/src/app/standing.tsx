import { useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'

const APPEAL = { none: '', pending: 'Appeal sent, a reviewer is looking', upheld: 'Appeal reviewed, decision stands', reduced: 'Appeal reviewed, reduced', overturned: 'Appeal reviewed, overturned' } as const

export default function Standing() {
  const account = useDb((s) => s.account)
  const [appealFor, setAppealFor] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!account) return null
  return (
    <Screen testID="standing" header={<TopBar back title="Account standing" />}>
      <Text variant="title">Account standing</Text>
      {account.standing === 'good' ? (
        <Banner tone="green" icon="check" title="In good standing">
          {account.notices.length ? 'Earlier notices are listed below.' : 'You have no notices.'}
        </Banner>
      ) : (
        <Banner tone="sun" icon="shield" title={account.standing === 'paused' ? 'Your account is paused' : 'Your account is restricted'}>
          Read the notice below. You can appeal it, and a different reviewer will decide.
        </Banner>
      )}
      {account.notices.map((n) => (
        <Card key={n.id} testID={`notice-${n.id}`}>
          <Badge tone={n.kind === 'warning' ? 'plain' : 'sun'} label={n.kind === 'warning' ? 'Warning' : n.kind === 'restriction' ? 'Restriction' : 'Suspension'} />
          <Text variant="h3" style={{ marginTop: 8 }}>
            {n.rule}
          </Text>
          <Text variant="small" style={{ marginTop: 4 }}>
            {n.explanation}
          </Text>
          <Text variant="caption" muted style={{ marginTop: 6 }}>
            {dayLong(n.at)}
            {n.expiresAt ? ` · ends ${dayLong(n.expiresAt)}` : ''}
          </Text>
          {n.appeal === 'none' ? (
            <Button testID={`appeal-${n.id}`} variant="quiet" size="sm" label="Appeal this notice" onPress={() => { setAppealFor(n.id); setText(''); setError(null) }} />
          ) : (
            <Text variant="small" bold style={{ marginTop: 8 }}>
              {APPEAL[n.appeal]}
            </Text>
          )}
        </Card>
      ))}
      <Sheet visible={!!appealFor} onClose={() => setAppealFor(null)} title="Appeal this notice">
        <Text variant="small" muted>
          Tell us what happened in your own words. A different reviewer will read it.
        </Text>
        <Field testID="appeal-text" label="Your appeal" value={text} onChangeText={setText} multiline minHeight={130} error={error} />
        <Button
          testID="appeal-send"
          label="Send appeal"
          onPress={async () => {
            const r = await api.account.appeal(appealFor!, text)
            if (!r.ok) return setError(r.error)
            setAppealFor(null)
          }}
        />
      </Sheet>
    </Screen>
  )
}
