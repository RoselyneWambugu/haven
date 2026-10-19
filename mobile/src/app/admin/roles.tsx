import { useState } from 'react'
import { View } from 'react-native'
import { api, type StaffRole } from '@/api'
import { Button } from '@/components/Button'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { canAccess, MODULES } from '@/lib/admin'
import { CAPABILITIES, describeChange, MIN_ACTIVE_ADMINS, roleName } from '@/lib/roles'
import { dayAndClock } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

const ROLES: StaffRole[] = ['moderator', 'clinical', 'billing', 'admin']

/**
 * Roles and permissions (PRD §3.2, RBAC-1, RBAC-2). Who is on the team, what each role may do, and which modules it sees.
 * Changing the team is sensitive, so a second Admin approves it. The second factor is required for everyone.
 */
export default function Roles() {
  const a = useDb((s) => s.admin)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; name: string; role: StaffRole } | null>(null)
  const [adding, setAdding] = useState<{ name: string; role: StaffRole } | null>(null)
  if (!a) return null
  const admin = a.role === 'admin'
  const pending = a.pendingStaff
  const result = (r: { ok: boolean; error?: string }, msg?: string) => {
    setError(r.ok ? null : (r.error ?? null))
    setOk(r.ok ? (msg ?? null) : null)
  }
  const mark = (c: 'yes' | 'no' | 'conditional') => (c === 'yes' ? '✔' : c === 'conditional' ? '◐' : '–')

  return (
    <PortalPage testID="admin-roles" title="Roles and permissions" sub="Who is on the team, what each role may do, and what it can see.">
      <Banner tone="green" icon="lock" title="Everyone signs in with a second factor">
        This can’t be turned off for any account (RBAC-2). Every action is written to the audit log. Changes to the team need a second Admin to approve.
      </Banner>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {ok ? (
        <Banner tone="green" icon="check">
          {ok}
        </Banner>
      ) : null}
      {pending ? (
        <Panel tone="sun" testID="pending-staff" title="A team change is waiting for a second Admin">
          <Text variant="small">
            {describeChange(pending.change, a.staff)}. Proposed by {pending.requestedBy}.
          </Text>
          {admin ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button testID="approve-staff" size="sm" label="Approve change" onPress={() => result(api.team.approveStaff(), 'The team change is in effect. Role changes apply at the person’s next sign-in.')} />
              <Button size="sm" variant="ghost" label="Withdraw" onPress={() => api.team.withdrawStaff()} />
            </View>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="The team" testID="roster">
        {a.staff.map((s) => (
          <View key={s.id} testID={`staff-${s.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 44 }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Text variant="label">{s.name}</Text>
              <Text variant="caption" muted>
                {s.lastSignInAt ? `Last signed in ${dayAndClock(s.lastSignInAt)}` : 'Not signed in yet'}
              </Text>
            </View>
            <Badge tone="plain" label={roleName(s.role)} />
            <Badge icon="check" label="MFA" />
            <Badge tone={s.active ? 'green' : 'sun'} label={s.active ? 'Active' : 'Deactivated'} />
            {admin ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button testID={`role-${s.name}`} size="sm" variant="quiet" label="Change role" disabled={!!pending} onPress={() => { setError(null); setEditing({ id: s.id, name: s.name, role: s.role }) }} />
                <Button testID={`active-${s.name}`} size="sm" variant="ghost" label={s.active ? 'Deactivate' : 'Reactivate'} disabled={!!pending} onPress={() => result(api.team.proposeStaff({ kind: 'active', id: s.id, active: !s.active }), 'Sent for approval by a second Admin.')} />
              </View>
            ) : null}
          </View>
        ))}
        {admin ? <Button testID="add-staff" size="sm" variant="quiet" icon="plus" label="Add a person" disabled={!!pending} onPress={() => { setError(null); setAdding({ name: '', role: 'moderator' }) }} /> : null}
        <Text variant="caption" muted>
          Keep at least {MIN_ACTIVE_ADMINS} active Admins so every sensitive change can have a second approver. You can’t change your own account.
        </Text>
      </Panel>

      <Panel title="What each role may do" testID="matrix">
        <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Text variant="caption" bold muted style={{ flex: 3 }}>
            Capability
          </Text>
          {ROLES.map((r) => (
            <Text key={r} variant="caption" bold muted style={{ flex: 2, textAlign: 'center' }}>
              {roleName(r)}
            </Text>
          ))}
        </View>
        {CAPABILITIES.map((c) => (
          <View key={c.key} testID={`cap-${c.key}`} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 }}>
            <Text variant="small" style={{ flex: 3 }}>
              {c.label}
            </Text>
            {ROLES.map((r) => (
              <View key={r} style={{ flex: 2, alignItems: 'center' }} accessible accessibilityLabel={`${roleName(r)}: ${c.roles[r] === 'yes' ? 'yes' : c.roles[r] === 'no' ? 'no' : `conditional. ${c.note?.[r] ?? ''}`}`}>
                <Text variant="body" color={c.roles[r] === 'no' ? colors.muted : colors.mossDeep}>
                  {mark(c.roles[r])}
                </Text>
                {c.note?.[r] ? (
                  <Text variant="caption" muted align="center">
                    {c.note[r]}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ))}
        <Text variant="caption" muted>
          ✔ allowed · ◐ only under the condition shown · – not allowed
        </Text>
      </Panel>

      <Panel title="What each role sees" testID="modules">
        <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          <Text variant="caption" bold muted style={{ flex: 3 }}>
            Module
          </Text>
          {ROLES.map((r) => (
            <Text key={r} variant="caption" bold muted style={{ flex: 2, textAlign: 'center' }}>
              {roleName(r)}
            </Text>
          ))}
        </View>
        {MODULES.map((m) => (
          <View key={m.key} style={{ flexDirection: 'row', minHeight: 28, alignItems: 'center' }}>
            <Text variant="small" style={{ flex: 3 }}>
              {m.label}
            </Text>
            {ROLES.map((r) => (
              <Text key={r} variant="small" color={canAccess(r, m.key) ? colors.mossDeep : colors.muted} style={{ flex: 2, textAlign: 'center' }}>
                {canAccess(r, m.key) ? '✔' : '–'}
              </Text>
            ))}
          </View>
        ))}
      </Panel>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={`Change role for ${editing?.name ?? ''}`} testID="role-sheet">
        {editing ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ROLES.map((r) => (
                <Chip key={r} testID={`pick-${r}`} label={roleName(r)} selected={editing.role === r} onPress={() => setEditing({ ...editing, role: r })} />
              ))}
            </View>
            {error ? <Banner tone="clay">{error}</Banner> : null}
            <Button
              testID="role-save"
              label="Propose change"
              onPress={() => {
                const r = api.team.proposeStaff({ kind: 'role', id: editing.id, role: editing.role })
                result(r, 'Sent for approval by a second Admin.')
                if (r.ok) setEditing(null)
              }}
            />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!adding} onClose={() => setAdding(null)} title="Add a person" testID="add-sheet">
        {adding ? (
          <>
            <Field testID="new-staff-name" label="Name" value={adding.name} onChangeText={(v) => setAdding({ ...adding, name: v })} />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ROLES.map((r) => (
                <Chip key={r} label={roleName(r)} selected={adding.role === r} onPress={() => setAdding({ ...adding, role: r })} />
              ))}
            </View>
            <Text variant="caption" muted>
              They set up their second factor the first time they sign in.
            </Text>
            {error ? <Banner tone="clay">{error}</Banner> : null}
            <Button
              testID="add-save"
              label="Propose"
              onPress={() => {
                const r = api.team.proposeStaff({ kind: 'add', name: adding.name, role: adding.role })
                result(r, 'Sent for approval by a second Admin.')
                if (r.ok) setAdding(null)
              }}
            />
          </>
        ) : null}
      </Sheet>
    </PortalPage>
  )
}
