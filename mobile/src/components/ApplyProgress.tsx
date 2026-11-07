import { View } from 'react-native'
import { Text } from './Text'
import { colors } from '@/theme'

/** The four steps of applying to join Echo as a therapist. */
export const APPLY_STEPS = ['Your phone', 'Details and documents', 'Review', 'Decision'] as const

/** Where the person is in the application: a bar for each step and a line saying which. `step` runs from 1 to 4. */
export function ApplyProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <View testID="apply-progress" accessibilityLabel={`Step ${step} of 4: ${APPLY_STEPS[step - 1]}`} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {APPLY_STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < step ? colors.moss : colors.lichenDeep }} />
        ))}
      </View>
      <Text variant="caption" muted>
        {`Step ${step} of 4 · ${APPLY_STEPS[step - 1]}`}
      </Text>
    </View>
  )
}
