import { useState } from 'react'
import { Share, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { canExportAudit, ROLE_LABEL } from '@/lib/admin'
import { clock, dayShort } from '@/lib/time'
import { useDb } from '@/store/db'

/** The audit log is read-only and append-only. Break-glass requests and approvals are separate entries so misuse is visible (ADM-14). */
export default function Audit() {
  const a = useDb((s) => s.admin)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!a) return null
  const rows = a.audit.filter((r) => `${r.actor} ${r.action} ${r.target} ${r.reason}`.toLowerCase().includes(q.trim().toLowerCase()))

  async function exportLog() {
    const r = api.admin.exportAudit()
    if (!r.ok) return setError(r.error)
    setError(null)
    try {
      await Share.share({ message: r.value.csv, title: 'Audit log' })
    } catch {
      // Dismissed.
    }
  }

  return (
    <PortalPage
      testID="admin-audit"
      title="Audit log"
      sub="Read-only and append-only. Nobody can edit or delete entries."
      actions={canExportAudit(a.role) ? <Button testID="export-audit" variant="quiet" label="Export (Admin)" onPress={exportLog} /> : undefined}
    >
      <Field testID="audit-search" label="Search" hideLabel placeholder="Actor, action, target or reason" value={q} onChangeText={setQ} />
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <Panel>
        <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
          {['Time', 'Actor', 'Action', 'Target', 'Reason'].map((h, i) => (
            <Text key={h} variant="caption" bold muted style={{ flex: i === 2 ? 2 : 1 }}>
              {h}
            </Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={r.id} testID="audit-row" style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 }}>
            <Text variant="small" style={{ flex: 1 }}>
              {dayShort(r.at)} {clock(r.at)}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {r.actor}
              {r.role !== 'system' ? ` · ${ROLE_LABEL[r.role].split(' ')[0]}` : ''}
            </Text>
            <Text variant="small" bold style={{ flex: 2 }}>
              {r.action}
            </Text>
            <Text variant="small" style={{ flex: 1 }}>
              {r.target}
            </Text>
            <Text variant="small" muted style={{ flex: 1 }}>
              {r.reason}
            </Text>
          </View>
        ))}
      </Panel>
      <Text variant="caption" muted>
        Every content view, identity reveal, sanction, export and permission change is recorded.
      </Text>
    </PortalPage>
  )
}
