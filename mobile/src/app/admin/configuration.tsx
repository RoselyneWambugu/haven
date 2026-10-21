import { useState } from 'react'
import { View } from 'react-native'
import { api, type PlanCfg } from '@/api'
import { REMOTE } from '@/backend/client'
import { remoteConfig } from '@/backend/remoteConfig'
import { Button } from '@/components/Button'
import { Badge, Chip, ToggleRow } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Panel, PortalPage, Stepper } from '@/components/Portal'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { ALWAYS_ON, FLAGS, HARD_RULES } from '@/lib/content'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

type Tab = 'plans' | 'topics' | 'matching' | 'flags' | 'limits'
const TABS: { key: Tab; label: string }[] = [
  { key: 'plans', label: 'Plans and entitlements' },
  { key: 'topics', label: 'Topics' },
  { key: 'matching', label: 'Matching' },
  { key: 'flags', label: 'Feature flags' },
  { key: 'limits', label: 'Limits' },
]

/**
 * Configuration (PRD §6.11): plans and entitlements, the community topics, matching rules, feature flags and limits.
 * Admin only, and every change is audited. Plan changes involve money, so a second admin has to approve them.
 * Safety features aren't flags: they can't be switched off here.
 */
export default function Configuration() {
  const a = useDb((s) => s.admin)
  const c = useDb((s) => s.content)
  const [tab, setTab] = useState<Tab>('plans')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlanCfg[] | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [topic, setTopic] = useState('')
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null)
  const [match, setMatch] = useState(c.matching)
  const [limits, setLimits] = useState(c.limits)
  if (!a) return null
  const plans = draft ?? c.plans
  const result = (r: { ok: boolean; error?: string }, msg?: string) => {
    setError(r.ok ? null : (r.error ?? null))
    setOk(r.ok ? (msg ?? null) : null)
  }

  const setPlan = (id: string, change: Partial<PlanCfg>) => setDraft(plans.map((p) => (p.id === id ? { ...p, ...change } : p)))

  return (
    <PortalPage testID="admin-config" title="Configuration" sub="Admin only. Every change is written to the audit log.">
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map((x) => (
          <Chip key={x.key} testID={`cf-${x.key}`} label={x.label} selected={tab === x.key} onPress={() => { setTab(x.key); setError(null); setOk(null) }} />
        ))}
      </View>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {ok ? (
        <Banner tone="green" icon="check">
          {ok}
        </Banner>
      ) : null}

      {tab === 'plans' ? (
        <>
          <Banner tone="green" icon="wallet">
            Prices are an open decision (D2). Leave a price blank and members see “KES ___”. Changes need a second admin to approve.
          </Banner>
          {c.pendingPlans ? (
            <Panel tone="sun" testID="pending-plans" title="A plan change is waiting for a second admin">
              <Text variant="small">Proposed by {c.pendingPlans.requestedBy}.</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button testID="approve-plans" size="sm" label="Approve change" onPress={async () => { const r = await api.config.approvePlans(); result(r, 'The plan change is live.') }} />
                {REMOTE && !c.pendingPlans.mine ? <Button size="sm" variant="ghost" label="Decline" onPress={async () => result(await remoteConfig.declinePlans(), 'Declined.')} /> : <Button size="sm" variant="ghost" label="Withdraw" onPress={() => api.config.withdrawPlans()} />}
              </View>
            </Panel>
          ) : null}
          {plans.map((p) => (
            <Panel key={p.id} title={`${p.label} · ${p.period}`} testID={`plan-${p.id}`}>
              <ToggleRow label="Offered to members" on={p.enabled} onChange={(v) => setPlan(p.id, { enabled: v })} />
              <Field
                testID={`price-${p.id}`}
                label="Price in KES (blank while undecided)"
                value={prices[p.id] ?? (p.priceKes === null ? '' : String(p.priceKes))}
                onChangeText={(v) => {
                  setPrices({ ...prices, [p.id]: v })
                  const n = v.trim() === '' ? null : Number(v)
                  setPlan(p.id, { priceKes: n === null || Number.isNaN(n) ? (v.trim() === '' ? null : -1) : n })
                }}
                keyboardType="number-pad"
              />
              <ToggleRow label="Disappearing chats" on={p.entitlements.disappearing} onChange={(v) => setPlan(p.id, { entitlements: { ...p.entitlements, disappearing: v } })} />
              <Stepper label="Discount on therapy sessions (%)" value={p.entitlements.therapistDiscountPct} min={0} max={50} step={5} onChange={(n) => setPlan(p.id, { entitlements: { ...p.entitlements, therapistDiscountPct: n } })} />
            </Panel>
          ))}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              testID="propose-plans"
              label="Propose change"
              disabled={!draft || !!c.pendingPlans}
              onPress={async () => {
                const r = await api.config.proposePlans(draft!)
                result(r, (r as { value?: { proposed?: boolean } }).value?.proposed === false ? 'Done.' : 'Sent for approval by a second admin.')
                if (r.ok) setDraft(null)
              }}
            />
            {draft ? <Button variant="ghost" label="Discard edits" onPress={() => { setDraft(null); setPrices({}) }} /> : null}
          </View>
        </>
      ) : null}

      {tab === 'topics' ? (
        <Panel title="Community topics" testID="topics">
          <Text variant="small" muted>
            These are the topics on posts and the chips members pick. Renaming carries existing posts with it. Retiring hides a topic from new posts, and old posts keep it.
          </Text>
          {c.topics.map((t) => (
            <View key={t} testID={`topic-${t}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="body" style={{ flex: 1 }}>
                {t}
              </Text>
              <Button size="sm" variant="quiet" label="Rename" onPress={() => { setError(null); setRename({ from: t, to: t }) }} />
              <Button size="sm" variant="ghost" label="Retire" onPress={async () => result(await api.config.retireTopic(t), `Retired ${t}.`)} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field testID="new-topic" label="New topic" value={topic} onChangeText={setTopic} />
            </View>
            <Button
              testID="add-topic"
              label="Add"
              onPress={async () => {
                const r = await api.config.addTopic(topic)
                result(r, `Added ${topic.trim()}.`)
                if (r.ok) setTopic('')
              }}
            />
          </View>
        </Panel>
      ) : null}

      {tab === 'matching' ? (
        <>
          <Panel title="Always on" tone="lichen">
            {HARD_RULES.map((r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
                <Icon name="lock" size={16} color={colors.mossDeep} />
                <Text variant="small" style={{ flex: 1 }}>
                  {r}
                </Text>
              </View>
            ))}
            <Text variant="caption" muted>
              These are rules, not settings.
            </Text>
          </Panel>
          <Panel title="Settings" testID="matching">
            <ToggleRow testID="neighbour" label="Look in neighbouring age ranges" sub="If no one is free in the same range" on={match.neighbourFallback} onChange={(v) => setMatch({ ...match, neighbourFallback: v })} />
            <Text variant="small" muted>
              Use shared topics to break ties
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[0, 0.25, 0.5, 1].map((w) => (
                <Chip key={w} testID={`weight-${w}`} label={w === 0 ? 'Never' : w === 1 ? 'Always' : `${w * 100}%`} selected={match.softTopicWeight === w} onPress={() => setMatch({ ...match, softTopicWeight: w })} />
              ))}
            </View>
            <Text variant="caption" muted>
              Topics only choose between people who already share an age range and a language. They never decide who is eligible (D17).
            </Text>
            <Stepper label="Days before the same two people can be matched again" value={match.rematchCooldownDays} min={0} max={365} step={7} onChange={(n) => setMatch({ ...match, rematchCooldownDays: n })} />
            <Button testID="save-matching" label="Save matching" onPress={async () => result(await api.config.setMatching(match), 'Matching updated.')} />
          </Panel>
        </>
      ) : null}

      {tab === 'flags' ? (
        <>
          <Panel title="Feature flags" testID="flags">
            {FLAGS.map((f) => (
              <ToggleRow key={f.key} testID={`flag-${f.key}`} label={f.label} sub={f.sub} on={c.flags[f.key]} onChange={async (v) => result(await api.config.setFlag(f.key, v), `${f.label} is ${v ? 'on' : 'off'}.`)} />
            ))}
          </Panel>
          <Panel title="Never switched off" tone="lichen">
            {ALWAYS_ON.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Icon name="lock" size={16} color={colors.mossDeep} />
                <Text variant="small">{x}</Text>
                <Badge label="Always on" />
              </View>
            ))}
          </Panel>
        </>
      ) : null}

      {tab === 'limits' ? (
        <Panel title="Limits" testID="limits">
          <Stepper label="Days chats stay read-only after a plan ends (D26)" value={limits.graceDays} min={0} max={60} onChange={(n) => setLimits({ ...limits, graceDays: n })} />
          <Stepper label="Days between pen-name changes (D36)" value={limits.penNameChangeDays} min={1} max={365} step={5} onChange={(n) => setLimits({ ...limits, penNameChangeDays: n })} />
          <Stepper label="Days an account is held after a deletion request (D34)" value={limits.deletionHoldDays} min={1} max={60} onChange={(n) => setLimits({ ...limits, deletionHoldDays: n })} />
          <Button testID="save-limits" label="Save limits" onPress={async () => result(await api.config.setLimits(limits), 'Limits updated for everyone.')} />
        </Panel>
      ) : null}

      <Sheet visible={!!rename} onClose={() => setRename(null)} title={`Rename ${rename?.from ?? ''}`}>
        {rename ? (
          <>
            <Field testID="rename-to" label="New name" value={rename.to} onChangeText={(v) => setRename({ ...rename, to: v })} error={error} />
            <Button
              testID="rename-save"
              label="Rename"
              onPress={async () => {
                const r = await api.config.renameTopic(rename.from, rename.to)
                result(r, `Renamed to ${rename.to.trim()}.`)
                if (r.ok) setRename(null)
              }}
            />
          </>
        ) : null}
      </Sheet>
    </PortalPage>
  )
}
