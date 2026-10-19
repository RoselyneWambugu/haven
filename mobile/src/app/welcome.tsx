import { Pressable, View } from 'react-native'
import { Button } from '@/components/Button'
import { Scene } from '@/components/Art'
import { Screen, TopBar } from '@/components/Layout'
import { Text } from '@/components/Text'
import { useT } from '@/i18n'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

/** The first thing a person sees: a calm place and a plain promise. Urgent help is already in the corner. */
export default function Welcome() {
  const t = useT()
  return (
    <Screen testID="welcome" header={<TopBar logo />} gap={16}
      footer={
        <>
          <Button testID="get-started" label={t('Get started')} onPress={() => go('/consent')} />
          <Button testID="have-account" label={t('I already have an account')} variant="ghost" onPress={() => go('/login')} />
          <Text variant="caption" muted align="center">
            Echo is peer support, not emergency care.
          </Text>
          <Pressable testID="therapist-link" accessibilityRole="link" accessibilityLabel="I’m a therapist" onPress={() => go('/portal/sign-in')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="small" align="center" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
              I’m a therapist
            </Text>
          </Pressable>
        </>
      }
    >
      <View style={{ height: 300, borderTopLeftRadius: 150, borderTopRightRadius: 150, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', backgroundColor: colors.lichen }}>
        <Scene />
      </View>
      <View style={{ gap: 8, paddingHorizontal: 4 }}>
        <Text variant="display">{t('A space to speak.')}</Text>
        <Text variant="display" italic color={colors.mossDeep}>
          {t('Someone to listen.')}
        </Text>
        <Text variant="body" muted style={{ marginTop: 4 }}>
          Talk anonymously with people who understand, or with a verified therapist.
        </Text>
      </View>
    </Screen>
  )
}
