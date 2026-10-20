import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Avatar, Ripple } from '@/components/Art'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon, type IconName } from '@/components/Icon'
import { Panel, useWide } from '@/components/Portal'
import { Text } from '@/components/Text'
import { api } from '@/api'
import { go, goBack } from '@/lib/nav'
import { useDb } from '@/store/db'
import type { Mode } from '@/api'
import { colors } from '@/theme'

const MODE_LABEL: Record<Mode, string> = { chat: 'Chat', voice: 'Voice', video: 'Video' }
const STEP_DOWN: Record<Mode, Mode> = { video: 'voice', voice: 'chat', chat: 'chat' }

/**
 * The live session: the call on one side, private notes on the other. Notes autosave and only the therapist sees them (THR-17).
 * "Not recorded" and "Raise a concern" stay visible. The call is simulated.
 */
export default function LiveSession() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const s = useDb((st) => st.portal?.sessions.find((x) => x.id === id))
  const wide = useWide()
  const [mode, setMode] = useState<Mode>('video')
  const [muted, setMuted] = useState(false)
  const [cam, setCam] = useState(true)
  const [secs, setSecs] = useState(0)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (s && !ready) {
      setMode(s.mode)
      setNote(s.note)
      setReady(true)
    }
  }, [s, ready])
  useEffect(() => {
    const i = setInterval(() => setSecs((x) => x + 1), 1000)
    return () => clearInterval(i)
  }, [])
  useEffect(() => {
    if (!ready || !id) return
    setSaved(false)
    const t = setTimeout(() => {
      api.portal.setNote(id, note)
      setSaved(true)
    }, 600)
    return () => clearTimeout(t)
  }, [note, ready, id])

  if (!s) return null
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')

  const ctl = (icon: IconName, label: string, on: boolean, onPress: () => void, testID: string) => (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: on ? colors.paper : 'rgba(245,246,234,0.18)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={22} color={on ? colors.fern : colors.paper} />
    </Pressable>
  )

  return (
    <View testID="portal-live" style={{ flex: 1, flexDirection: wide ? 'row' : 'column', padding: 18, gap: 16, backgroundColor: colors.paper }}>
      <View style={{ flex: wide ? 3 : 2, backgroundColor: colors.fern, borderRadius: 24, padding: 20, alignItems: 'center', justifyContent: 'space-between', minHeight: 320 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', alignItems: 'center', flexWrap: 'wrap' }}>
          <Text variant="label" color={colors.paper}>
            Session {s.number || 1} · {s.clientName}
          </Text>
          <Badge label={MODE_LABEL[mode]} tone="plain" />
          <Badge icon="shield" label="Not recorded" />
          <View style={{ flex: 1 }} />
          <Text testID="timer" variant="label" color={colors.lichen}>
            {mm}:{ss}
          </Text>
        </View>
        <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
          <Ripple size={140} color="rgba(221,231,203,0.5)" />
          <Avatar kind={s.clientAvatar} size={96} />
        </View>
        <Text variant="small" color={colors.lichen} align="center">
          {mode === 'video' ? 'Camera off · pen name and avatar shown' : mode === 'voice' ? 'Voice call' : 'Chat session'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {ctl(muted ? 'micoff' : 'mic', muted ? 'Unmute' : 'Mute', muted, () => setMuted((v) => !v), 'live-mute')}
          {mode === 'video' ? ctl(cam ? 'video' : 'videooff', cam ? 'Turn camera off' : 'Turn camera on', !cam, () => setCam((v) => !v), 'live-camera') : null}
          {mode !== 'chat' ? ctl('chats', `Switch to ${MODE_LABEL[STEP_DOWN[mode]].toLowerCase()}`, false, () => setMode(STEP_DOWN[mode]), 'live-switch') : null}
          <Pressable testID="live-end" accessibilityRole="button" accessibilityLabel="End session" onPress={() => go(`/portal/wrap-up/${s.id}`)} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.clay, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="end" size={22} color={colors.white} />
          </Pressable>
        </View>
      </View>
      <Panel title="Private notes" style={{ flex: wide ? 2 : 1 }}>
        <Text variant="caption" muted>
          Only you can see these. {saved ? 'Saved.' : 'Saving…'}
        </Text>
        <Field testID="live-notes" label="Notes" hideLabel multiline minHeight={200} value={note} onChangeText={setNote} placeholder="What you want to remember…" />
        <Button testID="live-concern" variant="dangerGhost" icon="flag" label="Raise a concern" onPress={() => go(`/portal/concern?session=${s.id}`)} />
        <Button variant="ghost" label="Back to Today" onPress={() => goBack('/portal/today')} />
      </Panel>
    </View>
  )
}
