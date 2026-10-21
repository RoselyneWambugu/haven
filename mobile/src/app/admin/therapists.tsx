import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { REMOTE } from '@/backend/client'
import { remoteAdmin } from '@/backend/remoteAdmin'
import { normaliseKenyanPhone } from '@/lib/identity'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { go } from '@/lib/nav'
import { licenceStatus } from '@/lib/portal'
import { liveStars, ratingLabel, summarise } from '@/lib/ratings'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'

const STATUS = { pending: 'Waiting for review', approved: 'Approved', info: 'More information asked', rejected: 'Not approved' } as const

export default function Therapists() {
  const a = useDb((s) => s.admin)
  const portal = useDb((s) => s.portal)
  const sessions = useDb((s) => s.sessions)
  const t = useNow()
  const [picked, setPicked] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const links = a?.therapistLinks ?? {}
  const apps = api.admin.applicants()
  const standing = a?.therapistStanding ?? {}
  const concerns = (id: string) => (a?.cases ?? []).filter((c) => c.therapistId === id).length
  const sel = THERAPISTS.find((x) => x.id === picked)
  const canAct = !!a && (a.role === 'clinical' || a.role === 'admin')

  async function act() {
    if (!sel) return
    const r = await (standing[sel.id] ? api.admin.reinstateTherapist(sel.id, reason) : api.admin.suspendTherapist(sel.id, reason))
    if (!r.ok) return setError(r.error)
    setError(null)
    setReason('')
    setPicked(null)
  }
  async function link() {
    if (!sel) return
    const n = normaliseKenyanPhone(phone)
    if (!n) return setLinkError('Enter a Kenyan mobile number, like 0712 345 678.')
    const r = await remoteAdmin.linkTherapist(sel.id, n)
    if (!r.ok) return setLinkError(r.error)
    setLinkError(null)
    setPhone('')
  }
  async function unlink() {
    if (!sel) return
    const r = await remoteAdmin.unlinkTherapist(sel.id, reason)
    if (!r.ok) return setLinkError(r.error)
    setLinkError(null)
    setReason('')
  }
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
      <Panel title="Roster" style={{ gap: 0 }} testID="roster">
        {THERAPISTS.map((th) => {
          const lic = licenceStatus(th.licenceValidTo, t)
          const off = !!standing[th.id]
          const paused = portal?.therapistId === th.id && portal.paused
          return (
            <Pressable key={th.id} testID={`roster-${th.id}`} accessibilityRole="button" accessibilityLabel={`${th.name}, ${off ? 'suspended' : 'active'}`} onPress={() => { setPicked(th.id); setReason(''); setError(null) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 52, flexWrap: 'wrap' }}>
              <Text variant="label" style={{ flex: 1, minWidth: 160 }}>
                {th.name}
              </Text>
              <Text variant="caption" muted>
                {ratingLabel(summarise(th, liveStars(sessions, th.id)))} · {concerns(th.id)} {concerns(th.id) === 1 ? 'concern' : 'concerns'}
              </Text>
              {lic.state !== 'ok' ? <Badge tone="sun" label={lic.state === 'expiring' ? `Licence ${lic.days} d left` : 'Licence expired'} /> : null}
              <Badge tone={off ? 'clay' : paused ? 'sun' : 'green'} label={off ? 'Suspended' : paused ? 'Paused' : 'Active'} />
            </Pressable>
          )
        })}
      </Panel>
      {sel ? (
        <Panel title={sel.name} testID="roster-detail">
          {standing[sel.id] ? (
            <Banner tone="clay" icon="lock" title="Suspended">
              {standing[sel.id].reason} · by {standing[sel.id].by}
            </Banner>
          ) : null}
          {REMOTE && canAct ? (
            <View style={{ gap: 8 }} testID="link-therapist">
              <Text variant="label">Portal sign-in</Text>
              {links[sel.id]?.linked || links[sel.id]?.pending ? (
                <>
                  <Banner tone="green" icon="lock">
                    {links[sel.id].linked ? `Linked to a number ending ${links[sel.id].tail}.` : `Waiting for the number ending ${links[sel.id].tail} to sign in for the first time.`}
                  </Banner>
                  <Text variant="caption" muted>
                    To unlink, give a reason below.
                  </Text>
                  <Button testID="unlink-therapist" variant="quiet" label="Unlink number" onPress={unlink} />
                </>
              ) : (
                <>
                  <Field testID="link-phone" label="Phone number" prefix="+254" placeholder="712 345 678" value={phone} onChangeText={(v) => { setPhone(v); setLinkError(null) }} keyboardType="phone-pad" error={linkError} />
                  <Button testID="link-therapist-go" label="Link number" onPress={link} />
                </>
              )}
              {links[sel.id] && (links[sel.id].linked || links[sel.id].pending) && linkError ? (
                <Text variant="small" color="#b3402a">
                  {linkError}
                </Text>
              ) : null}
            </View>
          ) : null}
          {canAct ? (
            <>
              <Field testID="roster-reason" label="Reason (required)" value={reason} onChangeText={(v) => { setReason(v); setError(null) }} multiline minHeight={70} error={error} />
              <Text variant="caption" muted>
                {standing[sel.id] ? 'Reinstating puts them back in the directory.' : 'They leave the directory and booked sessions are cancelled with no charge. The members are told.'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID="roster-act" variant={standing[sel.id] ? 'quiet' : 'danger'} label={standing[sel.id] ? 'Reinstate' : 'Suspend'} onPress={act} />
                <Button variant="ghost" label="Close" onPress={() => setPicked(null)} />
              </View>
            </>
          ) : (
            <Text variant="small" muted>
              Only clinical reviewers and Admins can suspend or reinstate a therapist.
            </Text>
          )}
        </Panel>
      ) : null}
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
