import { Pressable, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Text } from '@/components/Text'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

/** After Get started: are you here for support, or to offer it as a therapist? People who already have an account skip this, because Echo knows which they are. */
export default function Who() {
  return (
    <Screen testID="who" dark header={<TopBar back dark />} gap={16}>
      <Text variant="title" color={colors.paper}>Who are you joining as?</Text>
      <Text variant="body" color={colors.lichen}>
        Choose the one that fits. You can’t be both on the same account.
      </Text>
      <Choice testID="who-member" icon="heart" title="I’m looking for support" body="Talk anonymously with people who understand, join group chats, or book a therapist." onPress={() => go('/register')} />
      <Choice testID="who-therapist" icon="person" title="I’m a therapist" body="Apply to join Echo as a licensed therapist. We check your licence before you meet anyone." onPress={() => go('/portal/apply')} />
    </Screen>
  )
}

function Choice({ testID, icon, title, body, onPress }: { testID: string; icon: 'heart' | 'person'; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ borderRadius: 24, borderWidth: 1.5, borderColor: colors.sun, backgroundColor: 'rgba(242,235,221,0.07)', padding: 20, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={22} color={colors.moss} />
        </View>
        <Text variant="h2" color={colors.paper} style={{ flex: 1 }}>{title}</Text>
      </View>
      <Text variant="small" color={colors.lichen}>{body}</Text>
    </Pressable>
  )
}
