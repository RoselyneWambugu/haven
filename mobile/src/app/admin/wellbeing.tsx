import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Meter } from '@/components/Charts'
import { Panel, PortalPage, Stepper } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { breakSuggested, emptyExposure, onBreak, WEEK } from '@/lib/wellbeing'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'

/**
 * Reviewer wellbeing (PRD ADM-5, risk table). Content is blurred until revealed, reveals are limited each day, breaks are
 * suggested, the heaviest queue rotates, anyone can hand a case on or ask for support without giving a reason.
 * The limits are placeholders until D27 is decided.
 */
export default function Wellbeing() {
  const a = useDb((s) => s.admin)
  const t = useNow()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cfg, setCfg] = useState(a?.wellbeing)
  useEffect(() => {
    if (a?.signedIn) api.team.ensureRota()
  }, [a?.signedIn])
  if (!a || !cfg) return null
  const me = a.staffName
  const e = a.exposure[me] ?? emptyExposure()
  const admin = a.role === 'admin'
  const mods = a.staff.filter((s) => s.active && s.role === 'moderator').map((s) => s.name)
  const rota = [...a.rota].sort((x, y) => x.weekStart - y.weekStart).filter((r) => r.weekStart + WEEK > t).slice(0, 2)
  const result = (r: { ok: boolean; error?: string }, msg?: string) => {
    setError(r.ok ? null : (r.error ?? null))
    setOk(r.ok ? (msg ?? null) : null)
  }
  const breakEnds = e.breakUntil ? Math.max(0, Math.ceil((e.breakUntil - t) / 60_000)) : 0

  return (
    <PortalPage testID="admin-wellbeing" title="Wellbeing" sub="Reviewing hard content takes a toll. These are here to protect you.">
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {ok ? (
        <Banner tone="green" icon="check">
          {ok}
        </Banner>
      ) : null}

      <Panel title="Your exposure today" testID="exposure">
        <Meter label={`Messages revealed (${e.count} of ${a.wellbeing.dailyLimit})`} value={Math.min(e.count / a.wellbeing.dailyLimit, 1)} />
        {onBreak(e, t) ? (
          <Banner tone="green" icon="clock" title="You’re on a break">
            Revealing opens again in {breakEnds} min. Step away from the screen.
          </Banner>
        ) : breakSuggested(e, a.wellbeing, t) ? (
          <Banner tone="sun" icon="heart" title="Time for a break?" testID="break-suggested">
            You’ve revealed {e.sinceBreak} messages since your last break.
          </Banner>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {onBreak(e, t) ? (
            <Button testID="end-break" size="sm" variant="ghost" label="End my break" onPress={() => api.team.endBreak()} />
          ) : (
            <Button testID="start-break" size="sm" label={`Take a ${a.wellbeing.breakMinutes} minute break`} onPress={async () => result(await api.team.startBreak(), 'Break started. Revealing is paused.')} />
          )}
        </View>
        <Text variant="caption" muted>
          Content is blurred until you reveal it. Each reveal is counted for you, and the limit resets each day.
        </Text>
      </Panel>

      <Panel title="Heavy-queue rota" testID="rota">
        <Text variant="small" muted>
          Severity-1 and crisis cases are the hardest to read. Only the moderators on the rota work them, and the rota moves on each week. Clinical reviewers and Admins can always take them.
        </Text>
        {rota.map((r, i) => (
          <View key={r.weekStart} testID={`rota-${i}`} style={{ gap: 6 }}>
            <Text variant="label">
              {i === 0 ? 'This week' : 'Next week'} · from {dayLong(r.weekStart)}
            </Text>
            {admin && i === 1 ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {mods.map((m) => (
                  <Chip
                    key={m}
                    testID={`rota-pick-${m}`}
                    label={m}
                    selected={r.heavy.includes(m)}
                    onPress={async () => result(await api.team.setRota(r.weekStart, r.heavy.includes(m) ? r.heavy.filter((h) => h !== m) : [...r.heavy, m]), 'Rota updated.')}
                  />
                ))}
              </View>
            ) : (
              <Text variant="small">{r.heavy.join(', ') || 'No one yet'}</Text>
            )}
          </View>
        ))}
      </Panel>

      <Panel title="Support" tone="lichen" testID="support">
        <Text variant="small">You can always step back. Hand a case on from its page, or ask for support. Nobody will ask you to explain.</Text>
        <Text variant="small" muted>
          Staff wellbeing line: number to be confirmed (placeholder).
        </Text>
        <Button testID="ask-support" size="sm" variant="light" label="Ask for support" onPress={() => { api.team.askForSupport(); setOk('Thank you. Someone from the clinical team will check in with you.'); setError(null) }} />
      </Panel>

      {admin ? (
        <>
          <Panel title="Limits (Admin)" testID="limits-panel">
            <Stepper label="Reveals allowed each day" value={cfg.dailyLimit} min={5} max={100} step={5} onChange={(n) => setCfg({ ...cfg, dailyLimit: n })} />
            <Stepper label="Suggest a break after this many reveals" value={cfg.breakEvery} min={2} max={50} onChange={(n) => setCfg({ ...cfg, breakEvery: n })} />
            <Stepper label="Break length (minutes)" value={cfg.breakMinutes} min={1} max={60} step={5} onChange={(n) => setCfg({ ...cfg, breakMinutes: n })} />
            <Button testID="save-wellbeing" label="Save limits" onPress={async () => result(await api.team.setWellbeing(cfg), 'Limits updated for everyone.')} />
            <Text variant="caption" muted>
              These are placeholders until the limits are set with moderator-welfare advice (D27).
            </Text>
          </Panel>
          <Panel title="The team today">
            {a.staff
              .filter((s) => s.role === 'moderator' || s.role === 'clinical')
              .map((s) => (
                <Text key={s.id} variant="small">
                  {s.name}: {a.exposure[s.name]?.count ?? 0} revealed
                </Text>
              ))}
            <Text variant="caption" muted>
              Counts only. No one’s content is shown here.
            </Text>
          </Panel>
        </>
      ) : null}
    </PortalPage>
  )
}
