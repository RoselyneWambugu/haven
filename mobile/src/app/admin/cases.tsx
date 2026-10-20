import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Text } from '@/components/Text'
import { filterCases, minutesLeft, slaLabel, sortCases, type CaseFilter } from '@/lib/admin'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

const SOURCE = { 'user-report': 'User report', 'ai-flag': 'AI flag', 'crisis-flag': 'Crisis flag', appeal: 'Appeal' } as const
const STATUS = { new: 'New', 'in-review': 'In review', waiting: 'Waiting', closed: 'Closed' } as const
const SEV_COLOR = { S1: colors.clay, S2: colors.sunInk, S3: colors.muted } as const
const COLS = [0.9, 0.5, 1, 1.3, 0.7, 1, 0.9]

/** The case queue (ADM-7): severity first, then time left on the SLA clock. A red clock means the SLA is breached. */
export default function Cases() {
  const a = useDb((s) => s.admin)
  const t = useNow()
  const [filter, setFilter] = useState<CaseFilter>('all')
  const [query, setQuery] = useState('')
  if (!a) return null
  const open = a.cases.filter((c) => c.status !== 'closed')
  const count = (f: CaseFilter) => filterCases(a.cases, f, a.staffName).length
  const rows = sortCases(filterCases(a.cases, filter, a.staffName, query), t)
  const FILTERS: { key: CaseFilter; label: string }[] = [
    { key: 'all', label: `All ${open.length}` },
    { key: 'S1', label: `S1 ${count('S1')}` },
    { key: 'crisis', label: `Crisis ${count('crisis')}` },
    { key: 'appeals', label: `Appeals ${count('appeals')}` },
    { key: 'mine', label: `Mine ${count('mine')}` },
    { key: 'unassigned', label: `Unassigned ${count('unassigned')}` },
  ]

  return (
    <PortalPage testID="admin-cases" title="Cases" sub="Sorted by severity, then time left on the SLA clock.">
      <Field testID="case-search" label="Search" hideLabel placeholder="Case ID or pen name" value={query} onChangeText={setQuery} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} testID={`cf-${f.key}`} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
      <Panel style={{ padding: 8, gap: 0 }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          {['Case', 'Sev', 'Source', 'Type', 'SLA', 'Owner', 'Status'].map((h, i) => (
            <Text key={h} variant="caption" bold muted style={{ flex: COLS[i] }}>
              {h}
            </Text>
          ))}
        </View>
        {rows.length ? (
          rows.map((c) => {
            const sla = slaLabel(minutesLeft(c, t))
            return (
              <Pressable key={c.id} testID={`case-${c.id}`} accessibilityRole="button" accessibilityLabel={`${c.id}, ${c.severity}, ${c.type}, ${sla.breached ? 'SLA breached' : `${sla.text} left`}`} onPress={() => go(`/admin/case/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 48 }}>
                <Text variant="small" bold style={{ flex: COLS[0] }}>
                  {c.id}
                </Text>
                <Text variant="small" bold color={SEV_COLOR[c.severity]} style={{ flex: COLS[1] }}>
                  {c.severity}
                </Text>
                <Text variant="small" style={{ flex: COLS[2] }}>
                  {SOURCE[c.source]}
                </Text>
                <Text variant="small" style={{ flex: COLS[3] }}>
                  {c.type}
                </Text>
                <Text variant="small" bold color={sla.breached ? colors.clay : colors.ink} style={{ flex: COLS[4] }}>
                  {sla.text}
                </Text>
                <Text variant="small" muted style={{ flex: COLS[5] }}>
                  {c.owner ?? 'Unassigned'}
                </Text>
                <Text variant="small" style={{ flex: COLS[6] }}>
                  {STATUS[c.status]}
                </Text>
              </Pressable>
            )
          })
        ) : (
          <Text variant="small" muted style={{ padding: 14 }}>
            Nothing here.
          </Text>
        )}
      </Panel>
    </PortalPage>
  )
}
