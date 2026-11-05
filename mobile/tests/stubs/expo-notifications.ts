/** Stand-in for expo-notifications: it remembers what was scheduled, and a test decides what the phone's permission says. */
export interface Scheduled { identifier: string; content: Record<string, unknown>; trigger: { type: string; date: number; channelId?: string } }
export const phone: { granted: boolean; canAskAgain: boolean; scheduled: Scheduled[]; asked: number; channels: string[]; handler: unknown } = { granted: true, canAskAgain: true, scheduled: [], asked: 0, channels: [], handler: null }

export const SchedulableTriggerInputTypes = { DATE: 'date' }
export const AndroidImportance = { HIGH: 6 }
export const AndroidNotificationVisibility = { PRIVATE: 0 }
export const setNotificationHandler = (h: unknown): void => { phone.handler = h }
export const setNotificationChannelAsync = async (id: string): Promise<null> => (phone.channels.push(id), null)
export const getPermissionsAsync = async () => ({ granted: phone.granted, canAskAgain: phone.canAskAgain })
export const requestPermissionsAsync = async () => {
  phone.asked += 1
  return { granted: phone.granted, canAskAgain: phone.canAskAgain }
}
export const getAllScheduledNotificationsAsync = async () => phone.scheduled.map((s) => ({ identifier: s.identifier }))
export const cancelScheduledNotificationAsync = async (id: string): Promise<void> => { phone.scheduled = phone.scheduled.filter((s) => s.identifier !== id) }
export const scheduleNotificationAsync = async (r: Scheduled): Promise<string> => { phone.scheduled.push(r); return r.identifier }
export const addNotificationResponseReceivedListener = () => ({ remove: () => undefined })
