import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { alarmAccess, askForAlarms, type AlarmAccess } from '@/lib/localAlarms'
import { ToggleRow } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { View } from 'react-native'
import { lockScreen } from '@/lib/notifications'
import { REMOTE } from '@/backend/client'
import { colors } from '@/theme'
import { useDb } from '@/store/db'

export default function Notifications() {
  const s = useDb((st) => st.account?.settings)
  const [access, setAccess] = useState<AlarmAccess>('unsupported')
  useEffect(() => { void alarmAccess().then(setAccess) }, [])
  if (!s) return null
  const set = api.auth.setSettings
  return (
    <Screen testID="notifications" header={<TopBar back urgent title="Notifications" />}>
      <Text variant="title">Notifications</Text>
      <ToggleRow label="New messages" on={s.notifyMessages} onChange={(v) => set({ notifyMessages: v })} />
      <ToggleRow label="Session alarms" sub="An alert an hour and ten minutes before, in the app and when it is closed" on={s.notifySessions} onChange={(v) => { set({ notifySessions: v }); if (v && Platform.OS !== 'web') void askForAlarms().then(setAccess) }} />
      {s.notifySessions && (access === 'off' || access === 'denied') ? (
        <Banner tone="sun" icon="bell" title="Alarms can’t reach you when Echo is closed">
          {access === 'denied' ? 'Notifications are blocked for Echo. Turn them on in your phone’s settings, under Echo.' : 'Allow notifications so your phone can alert you even when Echo is closed.'}
        </Banner>
      ) : null}
      {s.notifySessions && access === 'off' ? <Button testID="alarm-allow" label="Allow notifications" variant="quiet" onPress={() => void askForAlarms().then(setAccess)} /> : null}
      {REMOTE ? <ToggleRow testID="sms-reminders" label="Text reminders" sub="One text an hour before a session. It says nothing about who it is with. Standard SMS rates may apply." on={s.smsReminders} onChange={(v) => set({ smsReminders: v })} /> : null}
      <ToggleRow label="Community replies" on={s.notifyForum} onChange={(v) => set({ notifyForum: v })} />
      <ToggleRow label="Plan and payment" on={s.notifyPlan} onChange={(v) => set({ notifyPlan: v })} />
      <ToggleRow label="Quiet hours" sub="No notifications from 10pm to 7am" on={s.quietHours} onChange={(v) => set({ quietHours: v })} />
      <Text variant="h3">Privacy on your lock screen</Text>
      <ToggleRow label="Hide message text" on={s.hideTextOnLockScreen} onChange={(v) => set({ hideTextOnLockScreen: v })} />
      <ToggleRow label="Neutral notifications" sub="Shows “You have a new update” instead of mentioning Echo" on={s.neutralNotifications} onChange={(v) => set({ neutralNotifications: v })} />
      <Text variant="small" muted>
        How a message looks on your lock screen
      </Text>
      <View testID="lock-preview" style={{ padding: 14, borderRadius: 16, backgroundColor: colors.milk, borderWidth: 1, borderColor: colors.line }}>
        <Text variant="label">{lockScreen({ category: 'message', title: 'New message from QuietHeron', body: 'Hi, how was your day?' }, s).title}</Text>
        <Text variant="small" muted>
          {lockScreen({ category: 'message', title: 'New message from QuietHeron', body: 'Hi, how was your day?' }, s).body}
        </Text>
      </View>
      <Banner tone="green" icon="bell">
        Urgent safety messages from us are always sent.
      </Banner>
    </Screen>
  )
}
