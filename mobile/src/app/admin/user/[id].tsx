import { useState } from 'react'
import { Share, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, useWide } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { canAccess } from '@/lib/admin'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import type { AvatarKind } from '@/api'

type Act = 'restrict' | 'suspend' | 'restore'

export default function UserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const a = useDb((s) => s.admin)
  const account = useDb((s) => s.account)
  const wide = useWide()
  const [act, setAct] = useState<Act | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  if (!a) return null
  const u = api.admin.users().find((x) => x.id === id)
  if (!u) return null
  const canAct = canAccess(a.role, 'moderation') || a.role === 'admin'
  const avatar: AvatarKind = u.isMember ? (account?.public.avatar ?? 'moon') : 'moon'

  async function exportData() {
    const r = api.admin.exportUser(u!.id)
    if (!r.ok) return setError(r.error)
    setExported('Exported and logged.')
    try {
      await Share.share({ message: r.value.json })
    } catch {
      // Dismissed.
    }
  }

  return (
    <PortalPage testID="admin-user" title={u.penName} sub={`Joined ${u.joined} · ${u.languages} · ${u.ageBand}`} actions={<Avatar kind={avatar} size={52} />}>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Panel title="Standing" style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }}>
          <Badge tone={u.standing === 'good' ? 'green' : 'sun'} label={u.standing === 'good' ? 'Good standing' : u.standing === 'restricted' ? 'Restricted' : 'Paused'} />
          {u.strikes.length ? (
            u.strikes.map((s, i) => (
              <Text key={s.id} variant="small">
                Strike {i + 1} · {dayLong(s.at)} · {s.rule} · {s.kind}
              </Text>
            ))
          ) : (
            <Text variant="small" muted>
              No strikes.
            </Text>
          )}
          <Text variant="caption" muted>
            Next: strike 2 is a 24 to 72 hour restriction. Strike 3 is a suspension pending review.
          </Text>
          <Text variant="small" muted>
            Reports against: {u.reportsAgainst} · Reports made: {u.reportsMade} · Blocks received: {u.blocksReceived}
          </Text>
          <Text variant="small" muted>
            Plan: {u.plan} · Matches: {u.matches} · Skips: {u.skips}
          </Text>
        </Panel>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 18 }}>
          <Panel title="Private profile" tone="lichen">
            <Text variant="small">Name, ID and phone are hidden. Break-glass only, from a case.</Text>
          </Panel>
          {canAct ? (
            <Panel title="Actions">
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button testID="act-restrict" size="sm" variant="quiet" label="Restrict" onPress={() => { setAct('restrict'); setReason(''); setError(null) }} />
                <Button testID="act-suspend" size="sm" variant="quiet" label="Suspend" onPress={() => { setAct('suspend'); setReason(''); setError(null) }} />
                <Button testID="act-restore" size="sm" variant="quiet" label="Restore" onPress={() => { setAct('restore'); setReason(''); setError(null) }} />
              </View>
              <Text variant="caption" muted>
                All actions need a reason and are logged.
              </Text>
            </Panel>
          ) : null}
          <Button testID="export-user" variant="ghost" label="Export data on request" onPress={exportData} />
          {exported ? <Banner tone="green" icon="check">{exported}</Banner> : null}
          {error && !act ? <Banner tone="clay">{error}</Banner> : null}
        </View>
      </View>
      <Sheet visible={!!act} onClose={() => setAct(null)} title={act === 'restore' ? `Restore ${u.penName}` : act === 'restrict' ? `Restrict ${u.penName}` : `Suspend ${u.penName}`} testID="user-act-sheet">
        <Text variant="small" muted>
          {u.isMember ? 'This changes the real member app on this device.' : 'This changes the member’s standing.'}
        </Text>
        <Field testID="user-act-reason" label="Reason (required)" value={reason} onChangeText={(v) => { setReason(v); setError(null) }} multiline minHeight={80} error={error} />
        <Button
          testID="user-act-confirm"
          variant={act === 'restore' ? 'primary' : 'danger'}
          label="Confirm"
          onPress={() => {
            const r = api.admin.userAction(u.id, act!, reason)
            if (!r.ok) return setError(r.error)
            setAct(null)
          }}
        />
      </Sheet>
    </PortalPage>
  )
}
