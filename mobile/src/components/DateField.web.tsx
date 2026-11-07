import { createElement } from 'react'
import { View } from 'react-native'
import { dobToIso, isoToDob } from '@/lib/identity'
import { colors, font, radius } from '@/theme'
import { Text } from './Text'
import type { DateFieldProps } from './DateField'

/** In a browser: the browser's own date box, with a drop-down calendar. The value is kept as "DD/MM/YYYY" like everywhere else. */
export function DateField({ label, value, onChange, error, hint, testID, maxIso, minIso = '1900-01-01' }: DateFieldProps) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" muted>
        {label}
      </Text>
      {createElement('input', {
        type: 'date',
        'data-testid': testID,
        'aria-label': label,
        value: dobToIso(value),
        min: minIso,
        max: maxIso ?? today,
        onChange: (e: { target: { value: string } }) => onChange(isoToDob(e.target.value)),
        style: {
          fontFamily: font.sans,
          fontSize: 16,
          color: colors.ink,
          backgroundColor: colors.milk,
          border: `${error ? 2 : 1.5}px solid ${error ? colors.clay : colors.line}`,
          borderRadius: radius.pill,
          padding: '0 18px',
          minHeight: 52,
          width: '100%',
          boxSizing: 'border-box',
          outline: 'none',
        },
      })}
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
