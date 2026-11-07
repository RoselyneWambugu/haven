import { useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { dateToDob, parseDob } from '@/lib/identity'
import { colors, radius } from '@/theme'
import { Button } from './Button'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { Text } from './Text'

export interface DateFieldProps {
  label: string
  /** "DD/MM/YYYY", or "" before a date is picked. */
  value: string
  onChange: (dob: string) => void
  error?: string | null
  hint?: string
  testID?: string
  /** The latest and earliest dates that can be picked, as "YYYY-MM-DD". The latest is today unless given. */
  maxIso?: string
  minIso?: string
}

const isoToLocal = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * On a phone: a button that opens the phone's own date picker, a calendar on Android and a calendar in a sheet on iPhone.
 * Opens on a date 25 years ago, because a date of birth is far from today.
 */
export function DateField({ label, value, onChange, error, hint, testID, maxIso, minIso = '1900-01-01' }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const picked = (() => {
    const p = parseDob(value)
    return p ? new Date(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()) : null
  })()
  const start = picked ?? new Date(new Date().getFullYear() - 25, 5, 15)
  const max = maxIso ? isoToLocal(maxIso) : new Date()
  const min = isoToLocal(minIso)
  const [draft, setDraft] = useState<Date>(start)

  function show() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        display: 'calendar',
        maximumDate: max,
        minimumDate: min,
        onChange: (e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onChange(dateToDob(d))
        },
      })
      return
    }
    setDraft(start)
    setOpen(true)
  }

  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" muted>
        {label}
      </Text>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}${picked ? `, ${value}` : ''}. Opens a calendar.`}
        onPress={show}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.milk, borderColor: error ? colors.clay : colors.line, borderWidth: error ? 2 : 1.5 }}
      >
        <Text variant="body" color={picked ? colors.ink : '#6E7B71'} style={{ flex: 1 }}>
          {picked ? value : 'Choose a date'}
        </Text>
        <Icon name="cal" size={20} color={colors.moss} />
      </Pressable>
      {error ? (
        <Text variant="small" color={colors.clay} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <DateTimePicker value={draft} mode="date" display="inline" maximumDate={max} minimumDate={min} onChange={(_e, d) => d && setDraft(d)} themeVariant="light" />
        <Button
          testID={testID ? `${testID}-done` : undefined}
          label="Done"
          onPress={() => {
            onChange(dateToDob(draft))
            setOpen(false)
          }}
        />
      </Sheet>
    </View>
  )
}
