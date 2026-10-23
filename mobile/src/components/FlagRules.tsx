import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Badge, Chip, ToggleRow } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadFlagRules, saveFlagRule, testFlagText, type FlagRule, type FlagRules, type FlagTest, type RuleReason } from '@/backend/remoteFlagRules'

const REASONS: { value: RuleReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'threats', label: 'Threat' },
  { value: 'self-harm', label: 'Self-harm concern' },
  { value: 'sexual', label: 'Sexual content' },
  { value: 'scam', label: 'Scam or money' },
  { value: 'hate', label: 'Hate speech' },
]

/** The patterns that raise automated flags, and how many messages the contact filter stopped. A flag is a signal for a person, never a verdict. */
export function FlagRulesPanel({ canEdit }: { canEdit: boolean }) {
  const [d, setD] = useState<FlagRules | null>(null)
  const [edit, setEdit] = useState<(Omit<FlagRule, 'id'> & { id: number | null }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [test, setTest] = useState<FlagTest | null>(null)

  const load = useCallback(async () => {
    const r = await loadFlagRules()
    if (r) setD(r)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  if (!d) return null

  async function save() {
    if (!edit) return
    const r = await saveFlagRule({ ...edit, id: edit.id })
    if (!r.ok) return setError(r.error)
    setEdit(null)
    setError(null)
    await load()
  }
  async function toggle(r: FlagRule, on: boolean) {
    const x = await saveFlagRule({ ...r, enabled: on })
    setError(x.ok ? null : x.error)
    await load()
  }
  async function tryIt() {
    const r = await testFlagText(text)
    if (r.ok) setTest(r.value)
    else setError(r.error)
  }

  return (
    <Panel title="Flag rules" testID="flag-rules">
      <Text variant="small" muted>
        Each rule looks for a pattern in what members write and opens a case for a person to decide. Rules can be switched off but not removed, so old flags still make sense.
      </Text>
      <Text variant="small">
        Contact details stopped before sending: <Text variant="small" bold>{d.blocked24h}</Text> in the last day, <Text variant="small" bold>{d.blocked7d}</Text> in the last week
        {' '}(phone {d.blockedByKind.phone}, links {d.blockedByKind.link}, addresses {d.blockedByKind.address}).
      </Text>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {d.rules.map((r) => (
        <View key={r.id} testID={`rule-${r.id}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={r.enabled ? 'green' : 'plain'} label={r.enabled ? 'On' : 'Off'} />
            <Text variant="label" style={{ flex: 1, minWidth: 160 }}>{r.category}</Text>
            <Text variant="caption" muted>confidence {r.confidence.toFixed(2)}</Text>
            {canEdit ? <Button testID={`rule-edit-${r.id}`} size="sm" variant="quiet" label="Edit" onPress={() => { setEdit({ ...r }); setError(null) }} /> : null}
          </View>
          <Text variant="caption" muted>{r.pattern}</Text>
          {canEdit ? <ToggleRow label="On" on={r.enabled} onChange={(v) => toggle(r, v)} /> : null}
        </View>
      ))}
      {canEdit && !edit ? <View style={{ flexDirection: 'row' }}><Button testID="rule-add" size="sm" label="Add a rule" onPress={() => { setEdit({ id: null, category: '', reason: 'harassment', pattern: '', confidence: 0.7, enabled: true }); setError(null) }} /></View> : null}
      {edit ? (
        <View style={{ gap: 8 }} testID="rule-form">
          <Field testID="rule-category" label="Name shown on the case" value={edit.category} onChangeText={(v) => setEdit({ ...edit, category: v })} />
          <Text variant="small" muted>Opens a case of this kind</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REASONS.map((x) => (
              <Chip key={x.value} label={x.label} selected={edit.reason === x.value} onPress={() => setEdit({ ...edit, reason: x.value })} />
            ))}
          </View>
          <Field testID="rule-pattern" label="Pattern (a regular expression, matched without regard to capitals)" value={edit.pattern} onChangeText={(v) => setEdit({ ...edit, pattern: v })} />
          <Field testID="rule-confidence" label="Confidence, 0.30 to 0.99" value={String(edit.confidence)} onChangeText={(v) => setEdit({ ...edit, confidence: Number(v) || 0 })} keyboardType="decimal-pad" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button testID="rule-save" size="sm" label="Save rule" onPress={save} />
            <Button size="sm" variant="ghost" label="Cancel" onPress={() => { setEdit(null); setError(null) }} />
          </View>
        </View>
      ) : null}
      <Field testID="rule-test-text" label="Try some words against the rules (nothing is stored)" value={text} onChangeText={(v) => { setText(v); setTest(null) }} />
      <View style={{ flexDirection: 'row' }}>
        <Button testID="rule-test" size="sm" variant="quiet" label="Test" disabled={!text.trim()} onPress={tryIt} />
      </View>
      {test ? (
        <Banner testID="rule-test-result" tone={test.flagged ? 'sun' : 'green'} icon={test.flagged ? 'shield' : 'check'} title={test.flagged ? `Flagged: ${test.category}` : 'Not flagged'}>
          {test.flagged ? `Confidence ${test.confidence?.toFixed(2)}. It would open a ${test.reason} case.` : 'No rule matches these words.'}
        </Banner>
      ) : null}
    </Panel>
  )
}
