import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, MAX_WIDTH } from '@/theme'
import { Icon } from './Icon'
import { Text } from './Text'

/** A bottom sheet. Closes on the back button, a tap outside, or the close control. */
export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} />
        <View testID={testID} accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={styles.grab} />
          <View style={styles.head}>
            {title ? (
              <Text variant="h3" style={{ flex: 1 }}>
                {title}
              </Text>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.close}>
              <Icon name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(20,32,26,0.45)' },
  sheet: { width: '100%', maxWidth: MAX_WIDTH, maxHeight: '88%', backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lichenDeep, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 36 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.lichen, alignItems: 'center', justifyContent: 'center' },
})
