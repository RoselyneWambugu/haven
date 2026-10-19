import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Portrait, Ripple } from '@/components/Art'
import { Icon, type IconName } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { replace } from '@/lib/nav'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/**
 * A simulated voice or video call, so the flow can be tried without a real connection.
 * Real audio and video need a provider (open decision), and nothing is recorded.
 */
export default function Call() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const s = useDb((st) => st.sessions.find((x) => x.id === id))
  const t = s ? THERAPISTS.find((x) => x.id === s.therapistId) : null
  const [secs, setSecs] = useState(0)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [speaker, setSpeaker] = useState(true)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const c = setTimeout(() => setConnected(true), 1500)
    return () => clearTimeout(c)
  }, [])
  useEffect(() => {
    if (!connected) return
    const i = setInterval(() => setSecs((x) => x + 1), 1000)
    return () => clearInterval(i)
  }, [connected])

  if (!s || !t) return null
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const video = s.mode === 'video'

  const ctl = (icon: IconName, label: string, on: boolean, onPress: () => void, testID: string) => (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: on ? colors.paper : 'rgba(245,246,234,0.18)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={24} color={on ? colors.fern : colors.paper} />
    </Pressable>
  )

  return (
    <Screen
      testID="call"
      dark
      header={<TopBar dark title="Session" />}
      scroll={false}
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
          {ctl(muted ? 'micoff' : 'mic', muted ? 'Unmute' : 'Mute', muted, () => setMuted((v) => !v), 'call-mute')}
          {video ? ctl(camOff ? 'videooff' : 'video', camOff ? 'Turn camera on' : 'Turn camera off', camOff, () => setCamOff((v) => !v), 'call-camera') : null}
          {ctl('spk', 'Speaker', speaker, () => setSpeaker((v) => !v), 'call-speaker')}
          <Pressable
            testID="call-end"
            accessibilityRole="button"
            accessibilityLabel="End session"
            onPress={() => {
              api.sessions.end(s.id)
              replace(`/sessions/${s.id}`)
            }}
            style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.clay, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="end" size={24} color={colors.white} />
          </Pressable>
        </View>
      }
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
          {connected ? <Ripple size={150} color="rgba(221,231,203,0.5)" /> : null}
          <Portrait tone={t.tone} width={110} height={130} />
        </View>
        <Text variant="h2" color={colors.paper}>
          {t.name}
        </Text>
        <Text variant="body" color={colors.lichen}>
          {connected ? `${mm}:${ss}` : 'Connecting…'}
        </Text>
        <Text variant="caption" color={colors.lichen} align="center" style={{ maxWidth: 280 }}>
          Demo call. No audio or video is sent or recorded.
        </Text>
      </View>
    </Screen>
  )
}
