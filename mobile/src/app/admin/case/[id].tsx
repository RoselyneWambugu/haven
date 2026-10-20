import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api, type BreakGlassRequest, type CaseAction } from '@/api'
import { Button } from '@/components/Button'
import { Radio, Segmented } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, useWide } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { breakSuggested, onBreak } from '@/lib/wellbeing'
import { BREAK_GLASS_MINUTES, canSeeCase, minutesLeft, REVEALS, slaLabel } from '@/lib/admin'
import { dayAndClock } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { colors } from '@/theme'

const ACTIONS: { value: CaseAction; label: string }[] = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'strike', label: 'Strike' },
  { value: 'restrict', label: 'Restrict' },
  { value: 'suspend', label: 'Suspend' },
  { value: 'escalate', label: 'Escalate' },
]
const THERAPIST_ACTIONS: { value: CaseAction; label: string }[] = [
  { value: 'dismiss', label: 'No action' },
  { value: 'warn-therapist', label: 'Warn' },
  { value: 'pause-therapist', label: 'Pause new clients' },
  { value: 'escalate', label: 'Escalate' },
]
const THERAPIST_HINT: Partial<Record<CaseAction, string>> = {
  dismiss: 'No breach found. The member is told generically.',
  'warn-therapist': 'The therapist is warned and told it is not a suspension. The member is told we took action.',
  'pause-therapist': 'New clients are paused until a clinical reviewer lifts it. Existing clients are not affected.',
  escalate: 'Hands the case to the clinical lead.',
}
const REASONS: { value: BreakGlassRequest['reasonCode']; label: string }[] = [
  { value: 'imminent-risk', label: 'Imminent risk to life' },
  { value: 'legal', label: 'Legal request (attach reference)' },
  { value: 'fraud', label: 'Fraud or serious harm' },
]

/**
 * Case detail. Evidence is blurred until revealed, each reveal is counted against a daily limit, and only the snapshot
 * is visible (ADM-2, ADM-8). Revealing identity is exceptional: it needs a second person (PRV-2, ADM-9).
 */
export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const a = useDb((s) => s.admin)
  const t = useNow()
  const wide = useWide()
  const [action, setAction] = useState<CaseAction>('strike')
  const portal = useDb((st) => st.portal)
  const [liftReason, setLiftReason] = useState('')
  const [liftError, setLiftError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState(false)
  const [bgReason, setBgReason] = useState<BreakGlassRequest['reasonCode']>('imminent-risk')
  const [bgText, setBgText] = useState('')
  const [bgError, setBgError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ReturnType<typeof api.admin.privateProfile>>(null)
  const c = a?.cases.find((x) => x.id === id && canSeeCase(a.role, x))

  useEffect(() => {
    if (id) api.admin.view(id)
  }, [id])
  if (!a || !c) return null
  const sla = slaLabel(minutesLeft(c, t))
  const exp = a.exposure[a.staffName]
  const req = a.breakGlass.find((b) => b.caseId === c.id && (b.status === 'pending' || (b.status === 'approved' && (b.expiresAt ?? 0) > t)))

  const clinical = c.queue === 'clinical'
  const act: CaseAction = clinical && !THERAPIST_ACTIONS.some((x) => x.value === action) ? 'dismiss' : action

  function decide() {
    const r = api.admin.decide(c!.id, act, reason)
    if (!r.ok) return setError(r.error)
    setError(null)
    setReason('')
  }

  return (
    <PortalPage
      testID="admin-case"
      title={`Case ${c.id}`}
      sub={`${c.severity} · ${c.type} · ${c.source === 'user-report' ? 'reported by user' : c.source === 'ai-flag' ? 'AI flag' : c.source === 'crisis-flag' ? 'crisis flag' : 'appeal'}`}
      actions={
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text variant="label" color={sla.breached ? colors.clay : colors.ink}>
            SLA {sla.breached ? `breached ${sla.text}` : `${sla.text} left`}
          </Text>
          {!c.owner && c.status !== 'closed' ? <Button testID="take-case" size="sm" label="Take this case" onPress={() => { const r = api.admin.claim(c.id); setError(r.ok ? null : r.error) }} /> : <Text variant="caption" muted>{c.owner ? `Owner: ${c.owner}` : 'Closed'}</Text>}
        </View>
      }
    >
      <Banner tone="green" icon="lock">
        You are viewing content within this case. Access is logged. Reveals today: {a.exposure[a.staffName]?.count ?? 0} / {a.wellbeing.dailyLimit}
      </Banner>
      {onBreak(exp, t) ? (
        <Banner tone="green" icon="clock" title="You’re on a break">
          Revealing is paused until it ends.
        </Banner>
      ) : breakSuggested(exp, a.wellbeing, t) ? (
        <Banner tone="sun" icon="heart" title="Time for a break?">
          You’ve revealed {exp?.sinceBreak} messages since your last break.
        </Banner>
      ) : null}
      {c.owner === a.staffName && c.status !== 'closed' ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button testID="hand-on" size="sm" variant="quiet" label="Hand this case on" onPress={() => { const r = api.team.handOn(c.id); setError(r.ok ? null : r.error) }} />
          <Button size="sm" variant="ghost" label="Take a break" onPress={() => api.team.startBreak()} />
        </View>
      ) : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Panel title="Evidence snapshot" style={{ flex: wide ? 3 : undefined, width: wide ? undefined : '100%' }}>
          <Text variant="caption" muted>
            Snapshot saved {dayAndClock(c.snapshotAt)} · content is blurred until you reveal it
          </Text>
          {c.evidence.map((e) => {
            const shown = a.revealed.includes(`${a.staffName}|${c.id}:${e.id}`)
            return (
              <View key={e.id} style={{ alignSelf: e.who === 'reporter' ? 'flex-start' : 'flex-end', maxWidth: '80%', gap: 4 }}>
                <View testID={`ev-${e.id}`} style={{ backgroundColor: e.reported ? colors.claySoft : colors.paper, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: e.reported ? colors.clay : colors.line }}>
                  {shown ? (
                    <Text variant="body">{e.text}</Text>
                  ) : (
                    <Text variant="body" color={colors.lichenDeep} accessibilityLabel="Hidden message. Reveal to read." selectable={false}>
                      {e.text.replace(/[^ ]/g, '•')}
                    </Text>
                  )}
                </View>
                {!shown ? (
                  <Pressable
                    testID={`reveal-${e.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Reveal message"
                    onPress={() => {
                      const r = api.admin.reveal(c.id, e.id)
                      setError(r.ok ? null : r.error)
                    }}
                    style={{ minHeight: 32, justifyContent: 'center' }}
                  >
                    <Text variant="small" bold color={colors.mossDeep}>
                      Reveal
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })}
          {error ? <Banner tone="clay">{error}</Banner> : null}
        </Panel>
        <View style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%', gap: 18 }}>
          <Panel title="Parties">
            <Text variant="small">Reporter: {c.reporter ?? '—'}</Text>
            <Text variant="small">Reported: {c.reported}</Text>
            <Text variant="small" muted>
              Strikes: {c.strikes} of 3 · prior reports: {c.priorReports}
            </Text>
          </Panel>
          {c.ai ? (
            <Panel title={`AI flag · ${c.ai.category}`} tone="lichen">
              <Text variant="small">
                Confidence {c.ai.confidence.toFixed(2)} · model {c.ai.model}
              </Text>
              <Text variant="caption" muted>
                A signal, not a verdict. A person decides.
              </Text>
            </Panel>
          ) : null}
        </View>
      </View>

      {c.status === 'closed' && c.decision ? (
        <Banner tone="green" icon="check" title={`Decided: ${c.decision.action}`}>
          {c.decision.reason} · by {c.decision.by}
        </Banner>
      ) : (
        <Panel title="Decision" testID="decision">
          <Segmented value={act} onChange={setAction} options={clinical ? THERAPIST_ACTIONS : ACTIONS} />
          <Text variant="caption" muted>
            {clinical ? THERAPIST_HINT[act] : action === 'escalate' ? 'Sends the case to a clinical reviewer.' : action === 'strike' ? 'The sanction follows the strike ladder.' : action === 'dismiss' ? 'No violation found. The reporter is told generically.' : 'The member is told the rule and how to appeal.'}
          </Text>
          <Field testID="decision-reason" label="Reason (required)" value={reason} onChangeText={(v) => { setReason(v); setError(null) }} multiline minHeight={80} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button testID="submit-decision" label="Submit decision" onPress={decide} />
            {clinical ? null : <Button testID="open-break-glass" variant="dangerGhost" label="Request private profile (break-glass)" onPress={() => { setSheet(true); setBgError(null) }} />}
          </View>
        </Panel>
      )}

      {clinical && c.decision?.action === 'pause-therapist' && portal?.review?.kind === 'paused' && portal.therapistId === c.therapistId ? (
        <Panel tone="sun" title="New clients are paused" testID="lift-pause">
          <Text variant="small">The therapist can’t switch this off. Lift it when the review is done.</Text>
          <Field testID="lift-reason" label="Reason (required)" value={liftReason} onChangeText={(v) => { setLiftReason(v); setLiftError(null) }} error={liftError} />
          <Button
            testID="lift-submit"
            variant="quiet"
            label="Lift pause"
            onPress={() => {
              const r = api.admin.liftTherapistPause(liftReason)
              if (!r.ok) return setLiftError(r.error)
              setLiftReason('')
            }}
          />
        </Panel>
      ) : null}

      {req ? (
        <Panel tone="sun" title="Private profile" testID="bg-status">
          {req.status === 'pending' ? (
            <Text variant="small">Waiting for the on-call clinical lead to approve. You can’t approve your own request.</Text>
          ) : (
            <>
              <Text variant="small">Approved by {req.approvedBy}. Access lasts {BREAK_GLASS_MINUTES} minutes and is logged. The member isn’t told.</Text>
              {profile ? (
                <View testID="bg-profile" style={{ gap: 2 }}>
                  <Text variant="label">{profile.name}</Text>
                  <Text variant="small">{profile.phone}</Text>
                  <Text variant="small">{profile.location}</Text>
                  <Text variant="caption" muted>
                    {profile.minutesLeft} min left
                  </Text>
                </View>
              ) : (
                <Button testID="bg-view" size="sm" label="View private profile" onPress={() => setProfile(api.admin.privateProfile(req.id))} />
              )}
            </>
          )}
        </Panel>
      ) : null}

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={`Request private profile for ${c.reported}`} testID="bg-sheet">
        <Text variant="small">This is logged, time-limited, and needs a second approver.</Text>
        {REASONS.map((r) => (
          <Radio key={r.value} selected={bgReason === r.value} onPress={() => setBgReason(r.value)} label={r.label} />
        ))}
        <Field testID="bg-justification" label="Explain why this is necessary (required)" value={bgText} onChangeText={(v) => { setBgText(v); setBgError(null) }} multiline minHeight={90} error={bgError} />
        <Banner tone="sun" icon="eye" title="Would reveal">
          {REVEALS.join(', ')}. Access lasts {BREAK_GLASS_MINUTES} min. The member is not notified. Approver: on-call clinical lead.
        </Banner>
        <Button
          testID="bg-request"
          label="Request approval"
          onPress={() => {
            const r = api.admin.requestBreakGlass(c.id, { reasonCode: bgReason, justification: bgText })
            if (!r.ok) return setBgError(r.error)
            setSheet(false)
            setBgText('')
          }}
        />
        <Button variant="ghost" label="Cancel" onPress={() => setSheet(false)} />
      </Sheet>
    </PortalPage>
  )
}
