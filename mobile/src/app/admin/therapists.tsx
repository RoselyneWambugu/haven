import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Badge } from '@/components/Controls'
import { Panel, PortalPage } from '@/components/Portal'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { go } from '@/lib/nav'
import { licenceStatus } from '@/lib/portal'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'

const STATUS = { pending: 'Waiting for review', approved: 'Approved', info: 'More information asked', rejected: 'Not approved' } as const

export default function Therapists() {
  useDb((s) => s.admin)
  useDb((s) => s.portal)
  const t = useNow()
  const apps = api.admin.applicants()
  return (
    <PortalPage testID="admin-therapists" title="Therapists" sub="Clinical checks sit with clinicians.">
      <Panel title="Applications" style={{ gap: 0 }}>
        {apps.map((x) => (
          <Pressable key={x.id} testID={`applicant-${x.id}`} accessibilityRole="button" accessibilityLabel={`${x.name}, ${STATUS[x.status]}`} onPress={() => go(`/admin/therapist/${x.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 }}>
            <Text variant="label" style={{ flex: 1 }}>
              {x.name}
            </Text>
            <Badge tone={x.status === 'pending' ? 'sun' : 'green'} label={STATUS[x.status]} />
          </Pressable>
        ))}
      </Panel>
      <Panel title="Licence expiry">
        {THERAPISTS.slice(0, 4).map((th) => {
          const s = licenceStatus(th.licenceValidTo, t)
          return (
            <View key={th.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text variant="small" style={{ flex: 1 }}>
                {th.name}
              </Text>
              <Text variant="caption" muted>
                valid to {dayLong(th.licenceValidTo)}
              </Text>
              <Badge tone={s.state === 'ok' ? 'green' : 'sun'} label={s.state === 'ok' ? 'OK' : s.state === 'expiring' ? `${s.days} d left` : 'Expired'} />
            </View>
          )
        })}
      </Panel>
    </PortalPage>
  )
}
