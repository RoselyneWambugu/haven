import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { colors, radius } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'ghost' | 'quiet' | 'deep' | 'urgent' | 'light' | 'lightGhost' | 'danger' | 'dangerGhost'

const BG: Record<ButtonVariant, string> = {
  primary: colors.moss, ghost: 'transparent', quiet: colors.lichen, deep: colors.fern, urgent: colors.clay, light: colors.paper,
  lightGhost: 'transparent', danger: colors.clay, dangerGhost: 'transparent',
}
const FG: Record<ButtonVariant, string> = {
  primary: colors.white, ghost: colors.mossDeep, quiet: colors.mossDeep, deep: colors.white, urgent: colors.white, light: colors.fern,
  lightGhost: colors.paper, danger: colors.white, dangerGhost: colors.clay,
}
const BORDER: Partial<Record<ButtonVariant, string>> = { ghost: colors.moss, lightGhost: 'rgba(245,246,234,0.5)', dangerGhost: colors.clay }

export interface ButtonProps {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  block?: boolean
  accessibilityHint?: string
  style?: ViewStyle
  testID?: string
}

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, disabled, loading, block = true, accessibilityHint, style, testID }: ButtonProps) {
  const off = disabled || loading
  const bg = disabled ? colors.lichen : BG[variant]
  const fg = disabled ? colors.muted : FG[variant]
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={!!off}
      onPress={off ? undefined : onPress}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1, alignSelf: block ? 'stretch' : 'flex-start' },
        !disabled && BORDER[variant] ? { borderWidth: 1.5, borderColor: BORDER[variant] } : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} color={fg} /> : null}
        <Text variant={size === 'sm' ? 'small' : 'body'} bold color={fg} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 50, paddingHorizontal: 22, paddingVertical: 12 },
  sm: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
