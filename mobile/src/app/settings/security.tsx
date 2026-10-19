import { View } from 'react-native'
import { api } from '@/api'
import { Segmented, ToggleRow } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

export default function Security() {
  const s = useDb((st) => st.account?.settings)
  const devices = useDb((st) => st.account?.devices.length ?? 0)
  if (!s) return null
  const set = api.auth.setSettings
  return (
    <Screen testID="security" header={<TopBar back title="Security" />}>
      <Text variant="title">Security</Text>
      <ToggleRow testID="app-lock" label="Lock the app" sub="Use your fingerprint, face or phone PIN" on={s.appLock} onChange={(v) => set({ appLock: v })} />
      {s.appLock ? (
        <View style={{ gap: 6 }}>
          <Text variant="small" muted>
            Lock after
          </Text>
          <Segmented
            value={String(s.lockAfterSeconds)}
            onChange={(v) => set({ lockAfterSeconds: Number(v) })}
            options={[{ value: '0', label: 'Right away' }, { value: '60', label: '1 min' }, { value: '300', label: '5 min' }]}
          />
        </View>
      ) : null}
      <ToggleRow label="Hide my pen name on the lock screen" on={s.hidePenNameOnLock} onChange={(v) => set({ hidePenNameOnLock: v })} />
      <ToggleRow label="Quick exit" sub="A button that locks Echo straight away" on={s.quickExit} onChange={(v) => set({ quickExit: v })} />
      <Row testID="open-devices" icon="phone" title="Devices" sub={`${devices} signed in`} onPress={() => go('/settings/devices')} last />
    </Screen>
  )
}
