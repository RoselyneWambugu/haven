import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { now } from './clock'
import type { PlannedAlarm } from './alarms'

/** Every alarm Echo schedules has this prefix, so Echo can replace its own and leave anything else alone. */
const PREFIX = 'alarm:'
const CHANNEL = 'sessions'

export type AlarmAccess = 'on' | 'off' | 'denied' | 'unsupported'

let ready = false

/**
 * Sets up how alarms behave: a loud, high-priority channel on Android, and sound without a second banner while Echo is open
 * (the in-app alarm is already on screen). Safe to call more than once.
 */
export async function prepareAlarms(): Promise<void> {
  if (ready || Platform.OS === 'web') return
  ready = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  })
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Session alarms',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
    })
  }
}

/** Whether the phone will let Echo alert the person while it is closed. */
export async function alarmAccess(): Promise<AlarmAccess> {
  if (Platform.OS === 'web') return 'unsupported'
  try {
    const p = await Notifications.getPermissionsAsync()
    return p.granted ? 'on' : p.canAskAgain ? 'off' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/** Asks the phone for permission, once the person has said they want alarms. */
export async function askForAlarms(): Promise<AlarmAccess> {
  if (Platform.OS === 'web') return 'unsupported'
  try {
    await prepareAlarms()
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
    return p.granted ? 'on' : p.canAskAgain ? 'off' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/**
 * Replaces every Echo alarm on the phone with `plan`. With an empty plan this just clears them (the person turned alarms off, signed out,
 * or has nothing booked). It never asks for permission itself: that happens when the person asks for alarms.
 */
export async function syncLocalAlarms(plan: PlannedAlarm[]): Promise<AlarmAccess> {
  if (Platform.OS === 'web') return 'unsupported'
  try {
    await prepareAlarms()
    const existing = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(existing.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)))
    if (plan.length === 0) return alarmAccess()
    const access = await alarmAccess()
    if (access !== 'on') return access
    const t = now()
    for (const a of plan) {
      if (a.at <= t) continue
      await Notifications.scheduleNotificationAsync({
        identifier: a.id,
        content: { title: a.title, body: a.body, sound: 'default', data: { route: a.route }, ...(Platform.OS === 'android' ? { channelId: CHANNEL } : null) } as Notifications.NotificationContentInput,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.at, channelId: CHANNEL },
      })
    }
    return 'on'
  } catch {
    return 'unsupported'
  }
}

/** Opens the screen an alarm points to when the person taps it. Returns a function that stops listening. */
export function onAlarmTapped(go: (route: string) => void): () => void {
  if (Platform.OS === 'web') return () => undefined
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const route = (r.notification.request.content.data as { route?: string } | undefined)?.route
    if (route) go(route)
  })
  return () => sub.remove()
}
