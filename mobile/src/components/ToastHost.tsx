import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useToast } from '@/store/toast'
import { colors, MAX_WIDTH } from '@/theme'
import { Text } from './Text'

export function ToastHost() {
  const toast = useToast()
  const insets = useSafeAreaInsets()
  if (!toast) return null
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text variant="small" color={colors.paper} align="center">
          {toast.text}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  toast: { maxWidth: MAX_WIDTH - 40, marginHorizontal: 20, backgroundColor: colors.fern, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
})
