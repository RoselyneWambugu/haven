import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Panel, PortalPage, Stat } from '@/components/Portal'
import { Text } from '@/components/Text'
import { FACES, KINDS, summariseHeard, triage } from '@/lib/feedback'
import { clock, dayShort } from '@/lib/time'
import { useDb } from '@/store/db'

/** What members tell us. Notes carry no name or account, and the felt-heard answers are shown only as shares of a large enough group. */
export default function Feedback() {
  const a = useDb((s) => s.admin)
  const notes = useDb((s) => s.feedback)
  const convs = useDb((s) => s.conversations)
  if (!a) return null
  const heard = summariseHeard(convs)
  const rows = triage(notes)
  const unread = notes.filter((n) => !n.reviewedBy).length
  const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k

  return (
    <PortalPage testID="admin-feedback" title="Feedback" sub="Notes from Settings, and how members rate their conversations. Notes show no name or account.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value={String(unread)} label="Notes to read" tone={unread ? 'sun' : undefined} />
        <Stat value={String(notes.length)} label="Notes in total" />
        <Stat value={heard.positive === null ? '—' : `${heard.positive}%`} label="Felt heard (4 or 5)" />
      </View>
      <Panel title="Did you feel heard?">
        {heard.answered === null ? (
          <Text testID="heard-hidden" variant="small" muted>
            Not enough answers yet. Results are hidden until at least 10 people have answered, so no one can be picked out.
          </Text>
        ) : (
          FACES.map((f, i) => (
            <View key={f.score} style={{ flexDirection: 'row', paddingVertical: 4 }}>
              <Text variant="small" style={{ flex: 2 }}>{f.label}</Text>
              <Text variant="small" bold style={{ flex: 1 }}>{heard.shares[i]}%</Text>
            </View>
          ))
        )}
        <Text variant="caption" muted>Comments people add to an answer stay private and are not shown here.</Text>
      </Panel>
      <Panel title="Notes">
        {rows.length ? (
          rows.map((n) => (
            <View key={n.id} testID="fb-row" style={{ gap: 6, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Badge label={kindLabel(n.kind)} tone={n.kind === 'bug' ? 'sun' : 'plain'} />
                <Text variant="caption" muted style={{ flex: 1 }}>
                  {dayShort(n.at)} {clock(n.at)}{n.withDevice ? ' · app details included' : ''}
                </Text>
                {n.reviewedBy ? <Badge icon="check" label={`Read by ${n.reviewedBy}`} /> : <Button testID="fb-read" variant="quiet" size="sm" label="Mark as read" onPress={() => api.feedback.review(n.id)} />}
              </View>
              <Text variant="body">{n.text}</Text>
            </View>
          ))
        ) : (
          <Text variant="small" muted>No notes yet.</Text>
        )}
      </Panel>
    </PortalPage>
  )
}
