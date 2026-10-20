import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Panel, PortalPage, Stat, useWide } from '@/components/Portal'
import { Banner, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { licenceStatus } from '@/lib/portal'
import { minutesLeft, visibleCases } from '@/lib/admin'
import { go } from '@/lib/nav'
import { clock } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

/** Start the day with what is urgent, not with vanity numbers (ADM-6). Headline figures here are sample data in the demo. */
export default function Overview() {
  const a = useDb((s) => s.admin)
  const portal = useDb((s) => s.portal)
  const t = useNow()
  const wide = useWide()
  if (!a) return null
  const open = visibleCases(a.cases, a.role).filter((c) => c.status !== 'closed')
  const s1Unassigned = open.filter((c) => c.severity === 'S1' && !c.owner).length
  const nearBreach = open.filter((c) => minutesLeft(c, t) <= 30).length
  const overSla = open.filter((c) => minutesLeft(c, t) <= 0).length
  const licence = portal ? licenceStatus(portal.licenceValidTo, t) : null
  const pendingBg = a.breakGlass.filter((b) => b.status === 'pending')
  const bars = [4, 6, 5, 9, 7, 12, 10]

  return (
    <PortalPage testID="admin-overview" title="Overview" sub={`Last updated ${clock(t)}`}>
      <Banner tone="sun" icon="clock" title="Sample data">
        The user and revenue figures below are made up for this demo. In the real dashboard they come from live data.
      </Banner>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat value="1,240" label="Active users (30 days)" />
        <Stat value="312" label="Paying users" />
        <Stat value="18" label="Active therapists" />
        <Stat value={String(open.length)} label={`Open cases · S1: ${open.filter((c) => c.severity === 'S1').length} · over SLA: ${overSla}`} tone={overSla ? 'sun' : undefined} />
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Panel title="Needs attention" style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }} testID="needs-attention">
          <Row title="Severity-1 cases unassigned" right={<Text variant="label">{s1Unassigned}</Text>} onPress={() => go('/admin/cases')} />
          <Row title="Cases near SLA breach" right={<Text variant="label">{nearBreach}</Text>} onPress={() => go('/admin/cases')} />
          <Row title="Break-glass requests waiting for approval" right={<Text variant="label">{pendingBg.length}</Text>} />
          <Row title="Therapist licences expiring (60 days)" right={<Text variant="label">{licence && licence.state !== 'ok' ? 1 : 0}</Text>} onPress={() => go('/admin/therapists')} />
          <Row title="Unmatched payments" right={<Text variant="label">{a.unmatchedPayments}</Text>} onPress={() => go('/admin/billing')} last />
        </Panel>
        <Panel title="New members (7 days)" style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 90 }}>
            {bars.map((h, i) => (
              <View key={i} style={{ flex: 1, height: h * 7, borderRadius: 6, backgroundColor: colors.lichenDeep }} />
            ))}
          </View>
          <Text variant="caption" muted>
            Placeholder chart. Deeper analytics live in their own module.
          </Text>
        </Panel>
      </View>
      {pendingBg.length && a.role === 'clinical' ? (
        <Panel title="Break-glass approvals" tone="sun" testID="bg-approvals">
          {pendingBg.map((b) => (
            <View key={b.id} style={{ gap: 6 }}>
              <Text variant="label">
                {b.target} · {b.reasonCode} · requested by {b.requestedBy}
              </Text>
              <Text variant="small">“{b.justification}”</Text>
              <Text variant="caption" muted>
                Approving reveals name, phone and location for 30 minutes. The member isn’t told, and it’s logged.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID={`bg-approve-${b.id}`} size="sm" label="Approve" onPress={() => api.admin.decideBreakGlass(b.id, true)} />
                <Button size="sm" variant="ghost" label="Decline" onPress={() => api.admin.decideBreakGlass(b.id, false)} />
              </View>
            </View>
          ))}
        </Panel>
      ) : null}
    </PortalPage>
  )
}
