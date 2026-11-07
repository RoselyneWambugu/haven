import { useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card } from '@/components/Surfaces'
import { Icon } from '@/components/Icon'
import { View } from 'react-native'
import { colors } from '@/theme'
import { Text } from '@/components/Text'
import { IF_NOT_GOOD, STANDING_HOW, STANDING_TIERS } from '@/data/standing'
import { go } from '@/lib/nav'
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
          <Badge tone={n.kind === 'warning' || n.kind === 'removal' ? 'plain' : 'sun'} label={n.kind === 'warning' ? 'Warning' : n.kind === 'removal' ? 'Removal' : n.kind === 'restriction' ? 'Restriction' : 'Suspension'} />
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
      <Card testID="standing-tiers">
        <Text variant="h3">How standing works</Text>
        <Text variant="small" muted style={{ marginTop: 4 }}>
          {STANDING_HOW}
        </Text>
        <View style={{ gap: 10, marginTop: 10 }}>
          {STANDING_TIERS.map((t) => (
            <View key={t.key} testID={`tier-${t.key}`} style={{ borderLeftWidth: 3, borderLeftColor: t.key === account.standing || (t.key === 'warning' && account.standing === 'good' && account.notices.some((n) => n.kind === 'warning')) ? colors.sun : colors.line, paddingLeft: 10 }}>
              <Text variant="label">{t.title}{t.key === account.standing ? ' (you are here)' : ''}</Text>
              <Text variant="small" muted>
                {t.body}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <View testID="standing-disclaimer" style={{ gap: 8, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="shield" size={18} color={colors.moss} />
          <Text variant="h3">If your standing isn’t good</Text>
        </View>
        {IF_NOT_GOOD.map((line) => (
          <Text key={line} variant="small" muted>
            {`•  ${line}`}
          </Text>
        ))}
        <Button testID="standing-help" variant="quiet" size="sm" label="Open the help centre" onPress={() => go('/help')} />
      </View>
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
