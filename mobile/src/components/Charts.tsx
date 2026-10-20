import { useState } from 'react'
import { Pressable, View } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { colors } from '@/theme'
import { Text } from './Text'

// ---------------------------------------------------------------------------
// Charts for the admin dashboard, drawn with plain views and SVG so they run in Expo Go and on the web.
// Rules kept throughout: one hue (Echo green) for magnitude, thin marks, hairline recessive grids, a few direct
// labels, text in text colours, a table view for every chart, and no second axis. Marks are pressable so the
// exact value shows on touch and on hover.
// ---------------------------------------------------------------------------

/** One green, light to dark. Checked with the palette validator as an ordinal ramp on the card surface. */
export const RAMP = ['#98B77D', '#68935F', '#3F6B4A', '#1C372A'] as const
export const MARK = RAMP[2]
const SURFACE = colors.milk
const GRID = colors.line

/** A figure with a label, an optional change against the last period, and a small trend. */
export function StatTile({ label, value, delta, goodWhenUp = true, spark, note, testID }: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean; spark?: number[]; note?: string; testID?: string }) {
  const up = (delta ?? 0) >= 0
  const good = delta === null || delta === undefined || Math.abs(delta) < 0.005 ? null : up === goodWhenUp
  const tone = good === null ? colors.muted : good ? colors.mossDeep : colors.clay
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${value}${delta != null ? `, ${up ? 'up' : 'down'} ${Math.abs(Math.round(delta * 100))} percent on the previous period` : ''}`} style={{ flex: 1, minWidth: 190, backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: GRID, padding: 16, gap: 4 }}>
      <Text variant="small" muted>
        {label}
      </Text>
      <Text variant="title">{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="caption" color={tone} bold={good !== null}>
          {delta === null || delta === undefined ? (note ?? ' ') : `${up ? '▲' : '▼'} ${Math.abs(Math.round(delta * 100))}% vs previous`}
        </Text>
        {spark ? <Spark values={spark} /> : null}
      </View>
    </View>
  )
}

function Spark({ values }: { values: number[] }) {
  const w = 72
  const h = 24
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * (w - 6) + 3, h - 3 - ((v - min) / Math.max(max - min, 1)) * (h - 6)] as const)
  const last = pts[pts.length - 1]
  return (
    <Svg width={w} height={h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')} stroke={RAMP[0]} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill={MARK} />
    </Svg>
  )
}

/** A chart on a card, with a switch to the same numbers as a table. */
export function ChartCard({ title, sub, children, table, testID }: { title: string; sub?: string; children: React.ReactNode; table: { head: string[]; rows: (string | number)[][] }; testID?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <View testID={testID} style={{ backgroundColor: SURFACE, borderRadius: 20, borderWidth: 1, borderColor: GRID, padding: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{title}</Text>
          {sub ? (
            <Text variant="caption" muted>
              {sub}
            </Text>
          ) : null}
        </View>
        <Pressable testID={testID ? `${testID}-toggle` : undefined} accessibilityRole="button" accessibilityLabel={view === 'chart' ? 'Show as table' : 'Show as chart'} onPress={() => setView(view === 'chart' ? 'table' : 'chart')} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text variant="small" bold color={colors.mossDeep}>
            {view === 'chart' ? 'Table' : 'Chart'}
          </Text>
        </Pressable>
      </View>
      {view === 'chart' ? children : <DataTable {...table} />}
    </View>
  )
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <View accessibilityRole="summary">
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: GRID, paddingBottom: 4 }}>
        {head.map((h, i) => (
          <Text key={h + i} variant="caption" bold muted style={{ flex: i === 0 ? 2 : 1 }}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', minHeight: 30, alignItems: 'center' }}>
          {r.map((c, j) => (
            <Text key={j} variant="small" style={{ flex: j === 0 ? 2 : 1, fontVariant: j === 0 ? undefined : ['tabular-nums'] }}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

/** Shows what is pressed or hovered, in text, above a chart. */
function Readout({ text }: { text: string | null }) {
  return (
    <View style={{ minHeight: 20 }} accessibilityLiveRegion="polite">
      <Text variant="small" bold>
        {text ?? ' '}
      </Text>
    </View>
  )
}

/** A trend over time: one 2px line, a faint wash beneath it, an end dot, and hairline gridlines. Press or hover for exact values. */
export function LineChart({ values, labels, format = (n: number) => String(Math.round(n)), height = 170, testID }: { values: number[]; labels: string[]; format?: (n: number) => string; height?: number; testID?: string }) {
  const [w, setW] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const padL = 40
  const padR = 14
  const padT = 10
  const padB = 22
  const max = niceMax(Math.max(...values, 1))
  const x = (i: number) => padL + (i / Math.max(values.length - 1, 1)) * Math.max(w - padL - padR, 1)
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const area = `${line}L${x(values.length - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`
  const at = pick ?? values.length - 1
  const ticks = [0, max / 2, max]
  return (
    <View testID={testID} style={{ gap: 6 }}>
      <Readout text={pick === null ? null : `${labels[pick]}: ${format(values[pick])}`} />
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {w > 0 ? (
          <>
            <Svg width={w} height={height}>
              {ticks.map((t) => (
                <Line key={t} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              ))}
              <Path d={area} fill={MARK} opacity={0.1} />
              <Path d={line} stroke={MARK} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={x(at)} cy={y(values[at])} r={6} fill={SURFACE} />
              <Circle cx={x(at)} cy={y(values[at])} r={4} fill={MARK} />
            </Svg>
            {ticks.map((t) => (
              <Text key={t} variant="caption" muted style={{ position: 'absolute', left: 0, width: padL - 6, textAlign: 'right', top: y(t) - 8 }}>
                {compactTick(t)}
              </Text>
            ))}
            <Text variant="caption" muted style={{ position: 'absolute', left: padL, bottom: 0 }}>
              {labels[0]}
            </Text>
            <Text variant="caption" muted style={{ position: 'absolute', right: padR, bottom: 0 }}>
              {labels[labels.length - 1]}
            </Text>
            <View style={{ position: 'absolute', left: padL, right: padR, top: 0, bottom: 0, flexDirection: 'row' }}>
              {values.map((_, i) => (
                <Pressable key={i} accessibilityLabel={`${labels[i]}: ${format(values[i])}`} onHoverIn={() => setPick(i)} onPressIn={() => setPick(i)} style={{ flex: 1 }} />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  )
}

/** Horizontal bars for ordered steps or ranked items: one colour, a value at each tip, and an optional note. */
export function BarList({ rows, format = (n: number) => String(Math.round(n)), testID }: { rows: { label: string; value: number; note?: string }[]; format?: (n: number) => string; testID?: string }) {
  const [pick, setPick] = useState<string | null>(null)
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {rows.map((r) => (
        <Pressable key={r.label} accessibilityLabel={`${r.label}: ${format(r.value)}${r.note ? `, ${r.note}` : ''}`} onHoverIn={() => setPick(r.label)} onHoverOut={() => setPick(null)} onPressIn={() => setPick(r.label)} style={{ gap: 4, opacity: pick === null || pick === r.label ? 1 : 0.6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small">{r.label}</Text>
            {r.note ? (
              <Text variant="caption" muted>
                {r.note}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, height: 14, backgroundColor: MARK, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
            </View>
            <Text variant="small" bold style={{ minWidth: 54, textAlign: 'right' }}>
              {format(r.value)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

/** Columns for a spread (for example minutes to first review). The tallest column is labelled, the rest read from the axis and the table. */
export function Columns({ data, testID }: { data: { label: string; count: number }[]; testID?: string }) {
  const [pick, setPick] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.count), 1)
  const top = data.findIndex((d) => d.count === max)
  const h = 120
  return (
    <View testID={testID} style={{ gap: 6 }}>
      <Readout text={pick === null ? null : `${data[pick].label}: ${data[pick].count}`} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: h, borderBottomWidth: 1, borderBottomColor: GRID }}>
        {data.map((d, i) => (
          <Pressable key={d.label} accessibilityLabel={`${d.label}: ${d.count}`} onHoverIn={() => setPick(i)} onPressIn={() => setPick(i)} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: h }}>
            {i === top ? (
              <Text variant="caption" bold>
                {d.count}
              </Text>
            ) : null}
            <View style={{ width: '70%', maxWidth: 24, height: Math.max((d.count / max) * (h - 18), 2), backgroundColor: MARK, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {data.map((d) => (
          <Text key={d.label} variant="caption" muted style={{ flex: 1, textAlign: 'center' }}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  )
}

/** A grid where darker means more. Used for retention cohorts. Empty cells are not zero: there is not enough time yet. */
export function Heat({ rows, cols, cells, bins, format, testID }: { rows: string[]; cols: string[]; cells: (number | null)[][]; bins: (x: number | null) => number; format: (n: number | null) => string; testID?: string }) {
  const [pick, setPick] = useState<string | null>(null)
  return (
    <View testID={testID} style={{ gap: 6 }}>
      <Readout text={pick} />
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <View style={{ width: 54 }} />
        {cols.map((c) => (
          <Text key={c} variant="caption" muted bold style={{ flex: 1, textAlign: 'center' }}>
            {c}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Text variant="caption" muted style={{ width: 54 }}>
            {r}
          </Text>
          {cols.map((c, j) => {
            const v = cells[i][j]
            const b = bins(v)
            return (
              <Pressable key={c} accessibilityLabel={`${r}, ${c}: ${format(v)}`} onHoverIn={() => setPick(`${r}, ${c}: ${format(v)}`)} onPressIn={() => setPick(`${r}, ${c}: ${format(v)}`)} style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: b < 0 ? colors.paper : RAMP[b], borderWidth: b < 0 ? 1 : 0, borderColor: GRID, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="caption" bold color={b < 0 ? colors.muted : b >= 2 ? colors.white : colors.ink}>
                  {format(v)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Text variant="caption" muted>
          Less
        </Text>
        {RAMP.map((c) => (
          <View key={c} style={{ width: 22, height: 10, borderRadius: 3, backgroundColor: c }} />
        ))}
        <Text variant="caption" muted>
          More
        </Text>
      </View>
    </View>
  )
}

/** One bar with a limit, for a single ratio such as "resolved within SLA". */
export function Meter({ value, label, testID }: { value: number | null; label: string; testID?: string }) {
  return (
    <View testID={testID} style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${value === null ? 'no data' : `${Math.round(value * 100)} percent`}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="small">{label}</Text>
        <Text variant="small" bold>
          {value === null ? '—' : `${Math.round(value * 100)}%`}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.lichen, overflow: 'hidden' }}>
        <View style={{ width: `${(value ?? 0) * 100}%`, height: 8, backgroundColor: MARK }} />
      </View>
    </View>
  )
}

function niceMax(n: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

function compactTick(n: number): string {
  return n >= 1000 ? `${n / 1000}K` : String(Math.round(n * 10) / 10)
}

