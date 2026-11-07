import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, Vibration, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSegments } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { alarmItems, dueAlarm, planAlarms, startsIn, withoutMuted } from '@/lib/alarms'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { alarmAccess, askForAlarms, onAlarmTapped, syncLocalAlarms } from '@/lib/localAlarms'
import { go } from '@/lib/nav'
import { THERAPISTS } from '@/data/seed'
import { useDb } from '@/store/db'
import { useMuted } from '@/store/mutedAlarms'
import { useNow } from '@/store/useNow'
import { colors, MAX_WIDTH, radius } from '@/theme'
import { Button } from './Button'
import { Icon } from './Icon'
import { Text } from './Text'

const ASKED_KEY = 'echo.alarms.asked'
let asked = false

/**
 * Session alarms, in two parts that both read the same bookings:
 *  - out of the app: the phone is handed a notification for an hour and for ten minutes before each start, and fires it even when Echo is closed;
 *  - in the app: ten minutes before (and for ten minutes after a start), a card sits across the top of every screen with Join, a short vibration
 *    and the alarm sound. It is left alone on a call or live session, where the person is already there.
 * Both follow the "Session reminders" setting, and neither waits for quiet hours: a session is not something to sleep through.
 */
export function SessionAlarmHost() {
  const t = useNow(10_000)
  const insets = useSafeAreaInsets()
  const segments = useSegments() as string[]
  const sessions = useDb((s) => s.sessions)
  const groupChats = useDb((s) => s.groupChats)
  const portalSessions = useDb((s) => s.portal?.sessions)
  const events = useDb((s) => s.events)
  const remindEvents = useDb((s) => s.account?.settings.notifyEvents ?? true)
  const memberIn = useDb((s) => s.signedIn)
  const therapistIn = useDb((s) => s.portal?.signedIn === true)
  const remind = useDb((s) => s.account?.settings.notifySessions ?? true)
  const hide = useDb((s) => s.account?.settings.hideTextOnLockScreen ?? true)
  const neutral = useDb((s) => s.account?.settings.neutralNotifications ?? true)
  const quiet = useDb((s) => s.account?.settings.quietHours ?? true)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const shown = useRef<string | null>(null)

  // What is booked. Only the person who is signed in on this device gets alarms for it.
  const muted = useMuted()
  const items = useMemo(
    () =>
      withoutMuted(alarmItems(
        {
          sessions: memberIn && remind ? sessions : [],
          groupChats: memberIn && remind ? groupChats : [],
          portalSessions: therapistIn && remind ? portalSessions : [],
          events: memberIn && remindEvents ? events : [],
          therapistName: (id) => THERAPISTS.find((x) => x.id === id)?.name,
        },
        t,
      ), muted),
    // `t` only matters for dropping what has ended, so a coarse minute is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, groupChats, portalSessions, events, memberIn, therapistIn, remind, remindEvents, muted, Math.floor(t / 60_000)],
  )
  const on = memberIn || therapistIn

  // Out of the app: give the phone the plan. A change in what is booked, or in the settings, replaces the old plan.
  const planKey = useMemo(() => JSON.stringify(on ? planAlarms(items, t, { hideTextOnLockScreen: hide, neutralNotifications: neutral, quietHours: quiet }).map((a) => [a.id, a.at, a.body]) : []), [on, items, hide, neutral, quiet, t])
  useEffect(() => {
    const plan = on ? planAlarms(items, t, { hideTextOnLockScreen: hide, neutralNotifications: neutral, quietHours: quiet }) : []
    void (async () => {
      // The first time there is something to be alarmed about, ask the phone once. After that the person decides in Settings.
      if (plan.length > 0 && Platform.OS !== 'web' && !asked) {
        asked = true
        const seen = await AsyncStorage.getItem(ASKED_KEY).catch(() => null)
        if (!seen) {
          await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined)
          if ((await alarmAccess()) === 'off') await askForAlarms()
        }
      }
      await syncLocalAlarms(plan)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey])
  useEffect(() => onAlarmTapped(go), [])

  // In the app: the card.
  const busy = segments[0] === 'call' || (segments[0] === 'portal' && segments[1] === 'session')
  const due = on && !busy ? dueAlarm(items, t, dismissed) : null
  useEffect(() => {
    if (!due || shown.current === due.id) return
    shown.current = due.id
    if (Platform.OS === 'web') {
      // A browser only lets a page vibrate once the person has touched it; otherwise it logs a complaint.
      try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([300, 150, 300]) } catch { /* not every browser can */ }
      try {
        // A browser tab that is out of sight can still be told, if the person has allowed it.
        if (typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Time to get ready', { body: hide ? 'Something is starting soon. Open Echo.' : `Your session ${startsIn(due.start, t)}.` })
        }
      } catch { /* ignore */ }
    } else {
      Vibration.vibrate([0, 400, 200, 400])
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined)
    }
  }, [due, hide, t])

  if (!due) return null
  const label = due.kind === 'group' ? 'Group chat' : due.kind === 'client' ? 'Session' : 'Session'
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: Math.max(insets.top, 10) + 4, paddingHorizontal: 12, zIndex: 50 }}>
      <View
        testID="session-alarm"
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={{ width: '100%', maxWidth: MAX_WIDTH, borderRadius: radius.md, backgroundColor: colors.fern, borderWidth: 1.5, borderColor: colors.sun, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: colors.sun, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clock" size={22} color="#D9B672" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" color={colors.paper}>
              {label} {startsIn(due.start, t)}
            </Text>
            <Text variant="small" color="#BFCDB8" numberOfLines={2}>
              {hide ? 'Open Echo to get ready.' : due.kind === 'group' ? due.who : `With ${due.who}`}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button testID="alarm-join" label="Join" size="sm" variant="light" onPress={() => { setDismissed((d) => new Set(d).add(due.id)); go(due.route) }} />
          </View>
          <Pressable testID="alarm-dismiss" accessibilityRole="button" accessibilityLabel="Dismiss the alarm" onPress={() => setDismissed((d) => new Set(d).add(due.id))} style={{ minHeight: 40, paddingHorizontal: 16, justifyContent: 'center' }}>
            <Text variant="small" color={colors.paper}>
              Dismiss
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
