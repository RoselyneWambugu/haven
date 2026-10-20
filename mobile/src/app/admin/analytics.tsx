import { useMemo, useState } from 'react'
import { Share, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { BarList, ChartCard, Columns, DataTable, Heat, LineChart, Meter, StatTile } from '@/components/Charts'
import { Chip } from '@/components/Controls'
import { PortalPage } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { canExportAnalytics, buildDays, change, cohorts, compact, histogram, memberFunnel, MIN_CELL, pct, percentile, RANGES, ratio, retentionBin, reviewMinutes, SECTIONS, sectionsFor, series, sum, therapyFunnel, whoIsUsing, type Day, type Range, type Totals, type Section } from '@/lib/analytics'
import { flagMetrics } from '@/lib/admin'
import { dayShort, startOfEatDay } from '@/lib/time'
import { now } from '@/lib/clock'
import { useDb } from '@/store/db'

const KEYS: Record<Section, (keyof Day)[]> = {
  product: ['installs', 'registered', 'verified', 'profiled', 'matched', 'firstMessage', 'active'],
  care: ['dirViews', 'bookings', 'sessions', 'ratings'],
  commercial: ['subscribed', 'renewals', 'churned', 'refunds'],
  safety: ['conversations', 'reports', 'blocks'],
}

/**
 * Analytics (PRD §2.3, §6.11, §11): Product, Care, Commercial and Safety, each shown only to the roles that need it.
 * Everything is a count or a rate. There is no message text and no identity, and groups under 10 people are hidden.
 * The numbers are generated for the demo and the page says so, except the AI-flag and appeal figures, which come from the live demo data.
 */
function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>
}

export default function Analytics() {
  const a = useDb((s) => s.admin)
  useDb((s) => s.account)
  const [range, setRange] = useState<Range>(30)
  const allowed = a ? sectionsFor(a.role) : []
  const [chosen, setChosen] = useState<Section | null>(null)
  const section: Section = chosen && allowed.includes(chosen) ? chosen : allowed[0]
  const [error, setError] = useState<string | null>(null)
  const anchor = startOfEatDay(now())
  const days = useMemo(() => buildDays(anchor), [anchor])
  const cur = sum(days, range)
  const prev = sum(days, range, 1)
  const labels = days.slice(-range).map((d) => dayShort(d.t))
  const spark = (k: keyof Totals) => series(days, k, range === 7 ? 7 : 14)
  if (!a || !section) return null

  const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10)

  async function exportCsv() {
    const keys = KEYS[section]
    const rows: (string | number | null)[][] = [['Date', ...keys], ...days.slice(-range).map((d) => [fmtDate(d.t), ...keys.map((k) => d[k])])]
    const r = api.admin.exportAnalytics(section, rows)
    if (!r.ok) return setError(r.error)
    setError(null)
    try {
      await Share.share({ message: r.value.csv, title: `Echo ${section} analytics` })
    } catch {
      // Dismissed.
    }
  }

  return (
    <PortalPage
      testID="admin-analytics"
      title="Analytics"
      sub="Counts and rates only. No message content, no identities, and small groups are hidden."
      actions={canExportAnalytics(a.role) ? <Button testID="export-analytics" variant="quiet" label="Export CSV (Admin)" onPress={exportCsv} /> : undefined}
    >
      <Banner tone="sun" icon="clock" title="Sample data">
        These figures are generated for the demo, the same every time. The AI-flag and appeal figures in Safety come from the live demo data.
      </Banner>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {SECTIONS.filter((s) => allowed.includes(s.key)).map((s) => (
          <Chip key={s.key} testID={`an-${s.key}`} label={s.label} selected={section === s.key} onPress={() => setSection(s.key)} />
        ))}
        <View style={{ flex: 1 }} />
        {RANGES.map((r) => (
          <Chip key={r} testID={`range-${r}`} label={`${r} days`} selected={range === r} onPress={() => setRange(r)} />
        ))}
      </View>
      {error ? <Banner tone="clay">{error}</Banner> : null}
      {section === 'product' ? product() : null}
      {section === 'care' ? care() : null}
      {section === 'commercial' ? commercial() : null}
      {section === 'safety' ? safety() : null}
    </PortalPage>
  )

  function setSection(s: Section) {
    setChosen(s)
  }

  function product() {
    const steps = memberFunnel(cur)
    const co = cohorts(anchor)
    const who = whoIsUsing()
    const activation = ratio(cur.firstMessage, cur.registered)
    const prevActivation = ratio(prev.firstMessage, prev.registered)
    const lastD7 = [...co].reverse().find((c) => c.d7 !== null)
    return (
      <>
        <Tiles>
          <StatTile testID="tile-registered" label="New registrations" value={compact(cur.registered)} delta={change(cur.registered, prev.registered)} spark={spark('registered')} />
          <StatTile label="Activation (first message)" value={pct(activation)} delta={activation !== null && prevActivation !== null ? change(activation, prevActivation) : null} note="of new registrations" />
          <StatTile label="Daily active members" value={compact(cur.active / range)} delta={change(cur.active, prev.active)} spark={spark('active')} />
          <StatTile label="Day-7 retention, latest cohort" value={pct(lastD7?.d7 ?? null)} note={lastD7 ? `week of ${lastD7.label}` : undefined} />
        </Tiles>
        <ChartCard testID="chart-funnel" title="From install to subscriber" sub={`Last ${range} days. The note on each bar is the share of the step before it.`} table={{ head: ['Step', 'Count', 'Of previous', 'Of installs'], rows: steps.map((s) => [s.label, s.count, pct(s.ofPrev), pct(s.ofFirst)]) }}>
          <BarList rows={steps.map((s) => ({ label: s.label, value: s.count, note: s.ofPrev === null ? undefined : `${pct(s.ofPrev)} of previous` }))} format={compact} />
        </ChartCard>
        <ChartCard testID="chart-registrations" title="Registrations per day" sub={`Last ${range} days`} table={{ head: ['Day', 'Registrations'], rows: labels.map((l, i) => [l, series(days, 'registered', range)[i]]) }}>
          <LineChart values={series(days, 'registered', range)} labels={labels} />
        </ChartCard>
        <ChartCard testID="chart-cohorts" title="Do people come back?" sub="Weekly sign-up cohorts. A blank cell means not enough time has passed yet, not zero." table={{ head: ['Cohort', 'Size', 'Day 1', 'Day 7', 'Day 30'], rows: co.map((c) => [c.label, c.size, pct(c.d1), pct(c.d7), pct(c.d30)]) }}>
          <Heat rows={co.map((c) => `${c.label}`)} cols={['Day 1', 'Day 7', 'Day 30']} cells={co.map((c) => [c.d1, c.d7, c.d30])} bins={(x) => retentionBin(x, 0.4)} format={(x) => (x === null ? '' : pct(x))} />
        </ChartCard>
        <ChartCard testID="chart-who" title="Who is using Echo" sub={`Active members by age range and language. Groups under ${MIN_CELL} people are hidden.`} table={{ head: ['Age range', ...who.cols], rows: who.rows.map((r, i) => [r, ...who.cells[i].map((c) => (c === null ? `<${MIN_CELL}` : c))]) }}>
          <DataTable head={['Age range', ...who.cols]} rows={who.rows.map((r, i) => [r, ...who.cells[i].map((c) => (c === null ? `<${MIN_CELL}` : c))])} />
        </ChartCard>
        <ChartCard title="Conversations" table={{ head: ['Measure', 'Share'], rows: [['Matches that were accepted', '68%'], ['Conversations with 5+ messages each way', '44%']] }}>
          <Meter label="Matches that were accepted" value={0.68} />
          <Meter label="Conversations with 5+ messages each way" value={0.44} />
        </ChartCard>
      </>
    )
  }

  function care() {
    const steps = therapyFunnel(cur)
    const booked = ratio(cur.bookings, cur.active)
    const prevBooked = ratio(prev.bookings, prev.active)
    return (
      <>
        <Tiles>
          <StatTile label="Sessions held" value={compact(cur.sessions)} delta={change(cur.sessions, prev.sessions)} spark={spark('sessions')} />
          <StatTile label="Bookings per 100 active member-days" value={booked === null ? '—' : (booked * 100).toFixed(1)} delta={booked !== null && prevBooked !== null ? change(booked, prevBooked) : null} />
          <StatTile label="Therapist session rating" value="4.7 / 5" note="sample" />
          <StatTile label="Median time to first available" value="1.6 days" note="sample" goodWhenUp={false} />
        </Tiles>
        <ChartCard testID="chart-therapy" title="From the directory to a rated session" sub={`Last ${range} days`} table={{ head: ['Step', 'Count', 'Of previous'], rows: steps.map((s) => [s.label, s.count, pct(s.ofPrev)]) }}>
          <BarList rows={steps.map((s) => ({ label: s.label, value: s.count, note: s.ofPrev === null ? undefined : `${pct(s.ofPrev)} of previous` }))} format={compact} />
        </ChartCard>
        <ChartCard title="Sessions per day" sub={`Last ${range} days`} table={{ head: ['Day', 'Sessions'], rows: labels.map((l, i) => [l, series(days, 'sessions', range)[i]]) }}>
          <LineChart values={series(days, 'sessions', range)} labels={labels} />
        </ChartCard>
        <ChartCard title="Therapist utilisation" table={{ head: ['Measure', 'Share'], rows: [['Available hours that were booked', '58%']] }}>
          <Meter label="Available hours that were booked" value={0.58} />
          <Text variant="caption" muted>
            Never used to rank therapists against each other.
          </Text>
        </ChartCard>
      </>
    )
  }

  function commercial() {
    const conv = ratio(cur.subscribed, cur.registered)
    const prevConv = ratio(prev.subscribed, prev.registered)
    const churn = ratio(cur.churned, cur.churned + cur.renewals)
    const prevChurn = ratio(prev.churned, prev.churned + prev.renewals)
    const refund = ratio(cur.refunds, cur.subscribed)
    const mix = [
      { label: 'Monthly', value: 51 },
      { label: 'Daily', value: 34 },
      { label: 'Yearly', value: 15 },
    ]
    return (
      <>
        <Banner tone="green" icon="wallet">
          Amounts aren’t shown while prices are an open decision (D2). These are counts and rates.
        </Banner>
        <Tiles>
          <StatTile label="New subscribers" value={compact(cur.subscribed)} delta={change(cur.subscribed, prev.subscribed)} spark={spark('subscribed')} />
          <StatTile label="Free to paid" value={pct(conv, 1)} delta={conv !== null && prevConv !== null ? change(conv, prevConv) : null} note="of new registrations" />
          <StatTile label="Churn" value={pct(churn, 1)} delta={churn !== null && prevChurn !== null ? change(churn, prevChurn) : null} goodWhenUp={false} note="of plans due" />
          <StatTile label="Refund rate" value={pct(refund, 1)} note="of new subscribers" />
        </Tiles>
        <ChartCard testID="chart-mix" title="Plan mix" sub="Share of active plans" table={{ head: ['Plan', 'Share'], rows: mix.map((m) => [m.label, `${m.value}%`]) }}>
          <BarList rows={mix} format={(n) => `${n}%`} />
        </ChartCard>
        <ChartCard title="New subscribers per day" sub={`Last ${range} days`} table={{ head: ['Day', 'Subscribers'], rows: labels.map((l, i) => [l, series(days, 'subscribed', range)[i]]) }}>
          <LineChart values={series(days, 'subscribed', range)} labels={labels} />
        </ChartCard>
      </>
    )
  }

  function safety() {
    const mins = reviewMinutes()
    const med = percentile(mins, 50)
    const p95 = percentile(mins, 95)
    const reportRate = ratio(cur.reports * 1000, cur.conversations)
    const prevReportRate = ratio(prev.reports * 1000, prev.conversations)
    const blockRate = ratio(cur.blocks * 100, cur.conversations)
    const m = flagMetrics(a!.flags)
    const decided = api.admin.appeals().filter((x) => x.status !== 'open')
    const overturned = decided.length ? decided.filter((x) => x.status === 'overturned').length / decided.length : null
    const hist = histogram(mins, [0, 10, 20, 30, 45, 60])
    return (
      <>
        <Tiles>
          <StatTile testID="tile-report-rate" label="Reports per 1,000 conversations" value={reportRate === null ? '—' : reportRate.toFixed(1)} delta={reportRate !== null && prevReportRate !== null ? change(reportRate, prevReportRate) : null} goodWhenUp={false} />
          <StatTile label="Blocks per 100 conversations" value={blockRate === null ? '—' : blockRate.toFixed(1)} />
          <StatTile label="S1 time to first review" value={med === null ? '—' : `${Math.round(med)} min`} note={p95 === null ? undefined : `95th percentile ${Math.round(p95)} min`} goodWhenUp={false} />
          <StatTile label="Resolved within SLA" value="93%" note="sample" />
        </Tiles>
        <ChartCard testID="chart-review" title="Minutes to first review, S1 reports" sub="How long the most serious reports wait for a person" table={{ head: ['Minutes', 'Reports'], rows: hist.map((h) => [h.label, h.count]) }}>
          <Columns data={hist} />
        </ChartCard>
        <ChartCard title="Reports per day" sub={`Last ${range} days`} table={{ head: ['Day', 'Reports'], rows: labels.map((l, i) => [l, series(days, 'reports', range)[i]]) }}>
          <LineChart values={series(days, 'reports', range)} labels={labels} />
        </ChartCard>
        <ChartCard testID="chart-ai" title="Automated flags and appeals" sub="From the live demo data" table={{ head: ['Measure', 'Value'], rows: [['AI-flag precision', pct(m.precision)], ['Flags overturned by a reviewer', pct(m.overturnRate)], ['Appeals decided', decided.length], ['Appeals overturned', pct(overturned)], ['Repeat-offender rate (sample)', '11%']] }}>
          <Meter label="AI-flag precision (reviewer upheld)" value={m.precision} />
          <Meter label="Flags overturned by a reviewer" value={m.overturnRate} />
          <Meter label={`Appeals overturned (${decided.length} decided)`} value={overturned} />
          <Meter label="Repeat-offender rate (sample)" value={0.11} />
        </ChartCard>
      </>
    )
  }
}

