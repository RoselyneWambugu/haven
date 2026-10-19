import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { resetTo } from '@/lib/nav'
import { colors } from '@/theme'

/** A kind stop, not a dead end (PRD ACC-9). Nothing the person typed is kept. */
export default function Under18() {
  return (
    <Screen testID="under-18" header={<TopBar logo />} footer={<Button label="Back to start" variant="ghost" onPress={() => resetTo('/welcome')} />}>
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="forum" size={34} color={colors.mossDeep} />
        </View>
        <Text variant="title" align="center">
          Echo is for people 18 and over
        </Text>
        <Text variant="body" muted align="center">
          This isn’t because you did anything wrong. Support for younger people needs extra care, and we’re not ready yet.
        </Text>
      </View>
      <Card tone="lichen">
        <Text variant="label" color={colors.mossDeep}>
          You can still get support
        </Text>
        <Text variant="small" color={colors.mossDeep} style={{ marginTop: 4 }}>
          Youth helpline ___, free, 24 hours.
        </Text>
        <Text variant="small" color={colors.mossDeep}>
          Talk to a trusted adult or a school counsellor.
        </Text>
      </Card>
      <Card>
        <Text variant="small" muted>
          We’ve deleted the details you entered. Nothing was saved.
        </Text>
      </Card>
    </Screen>
  )
}
