import { Pressable, StyleSheet, View } from 'react-native'
import { useSegments } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/components/Icon'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/** Pages where a floating button would sit on something: a message box, a payment button, or Help itself. */
export const NO_HELP_BUTTON = new Set(['help', 'urgent', 'unlock', 'chat', 'call', 'group-chats', 'match', 'checkout', 'pay', 'paused', 'portal', 'staff', 'admin', 'landing'])

/** Whether the floating Help button shows on a page, given its first route segment. */
export const showsHelpButton = (first: string | undefined, signedIn: boolean, locked: boolean): boolean => signedIn && !locked && !!first && !NO_HELP_BUTTON.has(first)

/**
 * A small round Help button at the bottom corner of every member page, so help is one tap away from anywhere.
 * It is not on pages where it would cover a message box or a payment button, nor on Help and Urgent help themselves.
 */
export function HelpFab() {
  const first = useSegments()[0] as string | undefined
  const signedIn = useDb((s) => s.signedIn)
  const locked = useDb((s) => s.locked)
  const unread = useDb((s) => s.tickets.filter((x) => x.unread).length)
  const insets = useSafeAreaInsets()
  if (!showsHelpButton(first, signedIn, locked)) return null
  // The tab pages have a bar along the bottom; the button floats above it.
  const bottom = (first === '(tabs)' ? 98 : 84) + insets.bottom
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <Pressable
        testID="help-fab"
        accessibilityRole="button"
        accessibilityLabel={unread ? `Help, ${unread} new` : 'Help'}
        onPress={() => go('/help')}
        style={{ position: 'absolute', right: 14, bottom, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fern, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}
      >
        <Icon name="help" size={22} color={colors.paper} />
        {unread ? <View style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sun }} /> : null}
      </Pressable>
    </View>
  )
}
