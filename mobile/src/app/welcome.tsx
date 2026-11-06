import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Bloom, Ornament } from '@/components/Bloom'
import { Screen, TopBar } from '@/components/Layout'
import { Text } from '@/components/Text'
import { useT } from '@/i18n'
import { go } from '@/lib/nav'
import { colors } from '@/theme'

/** The first thing a person sees: a calm place and a plain promise. Get started asks who you are; signing in does not, because Echo already knows. */
export default function Welcome() {
  const t = useT()
  return (
    <Screen testID="welcome" dark header={<TopBar logo dark />} gap={16}
      footer={
        <>
          <Button testID="get-started" variant="light" label={t('Get started')} onPress={() => go('/who')} />
          <Button testID="have-account" label={t('I already have an account')} variant="lightGhost" onPress={() => go('/login')} />
          <Text variant="caption" align="center" color={colors.lichen}>
            Echo is peer support, not emergency care.
          </Text>
        </>
      }
    >
      <View style={{ height: 300, borderTopLeftRadius: 150, borderTopRightRadius: 150, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', backgroundColor: colors.fern, borderWidth: 1.5, borderColor: colors.sun }}>
        <Bloom />
      </View>
      <View style={{ gap: 8, paddingHorizontal: 4 }}>
        <Text variant="display" color={colors.paper}>{t('A space to speak.')}</Text>
        <Text variant="display" italic color={colors.sun}>
          {t('Someone to listen.')}
        </Text>
        <Ornament width={96} />
        <Text variant="body" color={colors.lichen} style={{ marginTop: 4 }}>
          Talk anonymously with people who understand, or with a verified therapist.
        </Text>
      </View>
    </Screen>
  )
}
