import { useState } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { colors, font, radius } from '@/theme'
import { Text } from './Text'

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string
  hint?: string
  error?: string | null
  prefix?: string
  multiline?: boolean
  minHeight?: number
  hideLabel?: boolean
  right?: React.ReactNode
}

export function Field({ label, hint, error, prefix, multiline, minHeight, hideLabel, right, onFocus, onBlur, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      {hideLabel ? null : (
        <Text variant="small" muted>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.box,
          multiline ? { minHeight: minHeight ?? 110, alignItems: 'flex-start', borderRadius: radius.md } : null,
          { borderColor: error ? colors.clay : focused ? colors.moss : colors.line, borderWidth: focused || error ? 2 : 1.5 },
        ]}
      >
        {prefix ? (
          <Text variant="body" muted style={{ marginRight: 8 }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor="#7C8C80"
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[styles.input, multiline ? { paddingTop: 12, minHeight: minHeight ?? 110 } : null]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="small" color={colors.clay} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.milk, borderRadius: radius.pill, paddingHorizontal: 18, minHeight: 52 },
  input: { flex: 1, fontFamily: font.sans, fontSize: 16, color: colors.ink, paddingVertical: 10, outlineStyle: 'none' as never },
})
