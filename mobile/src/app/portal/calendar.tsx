import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { ToggleRow } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Panel, PortalPage, Stepper, useWide } from '@/components/Portal'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { blocksToCells, cellKey, type Cell } from '@/lib/portal'
import { dayLong, fromEat } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

const DAYS = [
  { dow: 1, label: 'Mon' },
  { dow: 2, label: 'Tue' },
  { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' },
  { dow: 5, label: 'Fri' },
  { dow: 6, label: 'Sat' },
  { dow: 0, label: 'Sun' },
]
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
const SYMBOL: Record<Cell, string> = { off: '', chat: 'Chat', voice: 'Voice', all: 'Video' }
const FILL: Record<Cell, string> = { off: colors.paper, chat: colors.lichen, voice: colors.lichenDeep, all: colors.moss }
const INK: Record<Cell, string> = { off: colors.muted, chat: colors.mossDeep, voice: colors.fern, all: colors.white }

function parseDay(input: string): number | null {
  const m = input.trim().match(/^(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})$/)
  if (!m) return null
  return fromEat(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 0, 0)
}

/** Weekly availability, time off and caps (PRD THR-5, THR-16). Tap an hour to cycle off, chat, voice, video. */
export default function Calendar() {
  const p = useDb((s) => s.portal)
  const wide = useWide()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!p) return null
  const cells = blocksToCells(p.availability)

  function addTimeOff() {
    const a = parseDay(from)
    const b = parseDay(to || from)
    if (a === null || b === null) return setError('Use the format DD/MM/YYYY.')
    const r = api.portal.addTimeOff(a, b + 24 * 3600_000)
    if (!r.ok) return setError(r.error)
    setFrom('')
    setTo('')
    setError(null)
  }

  return (
    <PortalPage testID="portal-calendar" title="Weekly availability" sub="Times are in Kenya time (EAT). Tap an hour to change it.">
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <Panel style={{ flex: wide ? 2 : undefined, width: wide ? undefined : '100%' }}>
          <ScrollView horizontal>
            <View>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 52 }} />
                {DAYS.map((d) => (
                  <View key={d.dow} style={{ width: 70, alignItems: 'center', paddingBottom: 6 }}>
                    <Text variant="label">{d.label}</Text>
                  </View>
                ))}
              </View>
              {HOURS.map((h) => (
                <View key={h} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="caption" muted style={{ width: 52 }}>
                    {String(h).padStart(2, '0')}:00
                  </Text>
                  {DAYS.map((d) => {
                    const c = cells[cellKey(d.dow, h)] ?? 'off'
                    return (
                      <Pressable
                        key={d.dow}
                        testID={`cell-${d.dow}-${h}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${d.label} ${h}:00, ${c === 'off' ? 'not available' : c === 'chat' ? 'chat only' : c === 'voice' ? 'chat and voice' : 'chat, voice and video'}`}
                        onPress={() => api.portal.setCell(d.dow, h)}
                        style={{ width: 66, height: 40, margin: 2, borderRadius: 10, backgroundColor: FILL[c], borderWidth: 1, borderColor: c === 'off' ? colors.line : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text variant="caption" color={INK[c]}>
                          {SYMBOL[c]}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <Text variant="caption" muted>
            Chat · Chat and voice · Chat, voice and video · Not available
          </Text>
        </Panel>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 18 }}>
          <Panel title="Capacity">
            <ToggleRow testID="pause-new" label="Pause new clients" sub="Existing clients are unaffected" on={p.paused} onChange={(v) => api.portal.setPaused(v)} />
            <Stepper label="Max sessions a day" value={p.caps.perDay} min={1} max={10} onChange={(v) => api.portal.setCaps({ perDay: v })} />
            <Stepper label="Buffer between sessions (min)" value={p.caps.bufferMin} min={0} max={60} step={5} onChange={(v) => api.portal.setCaps({ bufferMin: v })} />
            <Stepper label="Max new clients a week" value={p.caps.newPerWeek} min={0} max={15} onChange={(v) => api.portal.setCaps({ newPerWeek: v })} />
          </Panel>
          <Panel title="Time off">
            {p.timeOff.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="small" style={{ flex: 1 }}>
                  {dayLong(t.start)} to {dayLong(t.end - 1)}
                </Text>
                <Button size="sm" variant="ghost" label="Remove" onPress={() => api.portal.removeTimeOff(t.id)} />
              </View>
            ))}
            <Field testID="off-from" label="From" placeholder="DD/MM/YYYY" value={from} onChangeText={setFrom} />
            <Field testID="off-to" label="To (optional)" placeholder="DD/MM/YYYY" value={to} onChangeText={setTo} />
            {error ? <Banner tone="clay">{error}</Banner> : null}
            <Button testID="add-off" variant="quiet" label="Add time off" icon="plus" onPress={addTimeOff} />
            <Text variant="caption" muted>
              Clients with bookings in that time are told automatically and offered a new one.
            </Text>
          </Panel>
        </View>
      </View>
    </PortalPage>
  )
}
