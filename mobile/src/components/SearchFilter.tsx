import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Text } from '@/components/Text'
import { activeChoices, clearAll, toggleIn, type FilterGroup } from '@/lib/searchFilter'
import { colors } from '@/theme'

/**
 * A search bar with a filter button at its right end. The button opens a dropdown under the bar that holds every way to sort or narrow the list,
 * so the page isn't a stack of chips. What is switched on shows as small removable chips under the bar, and the button counts them.
 * Without `onQuery` it is just the button (for a list that has its own search).
 */
export function SearchFilter({ testID, query, onQuery, placeholder = 'Search', groups, resultLabel, onToggle }: {
  testID: string
  query?: string
  onQuery?: (v: string) => void
  placeholder?: string
  groups: FilterGroup[]
  /** What the apply button says, such as “Show 8 therapists”. */
  resultLabel: string
  onToggle?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const chosen = activeChoices(groups)
  const set = (v: boolean) => {
    setOpen(v)
    onToggle?.(v)
  }
  const button = (
    <Pressable
      testID={`${testID}-filters`}
      accessibilityRole="button"
      accessibilityLabel={chosen.length ? `Sort and filter, ${chosen.length} on` : 'Sort and filter'}
      accessibilityState={{ expanded: open }}
      onPress={() => set(!open)}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: open || chosen.length ? colors.lichen : 'transparent' }}
    >
      <Icon name="filter" size={20} color={colors.mossDeep} />
      {chosen.length ? <Text variant="caption" bold color={colors.mossDeep}>{chosen.length}</Text> : null}
    </Pressable>
  )
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {onQuery ? (
        <Field testID={`${testID}-search`} label="Search" hideLabel placeholder={placeholder} value={query ?? ''} onChangeText={onQuery} right={button} />
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
          <Pressable
            testID={`${testID}-filters`}
            accessibilityRole="button"
            accessibilityLabel={chosen.length ? `Sort and filter, ${chosen.length} on` : 'Sort and filter'}
            accessibilityState={{ expanded: open }}
            onPress={() => set(!open)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.milk }}
          >
            <Icon name="filter" size={18} color={colors.mossDeep} />
            <Text variant="small">Sort and filter</Text>
            {chosen.length ? <Text variant="caption" bold color={colors.mossDeep}>({chosen.length})</Text> : null}
          </Pressable>
        </View>
      )}
      {open ? (
        <View testID={`${testID}-dropdown`} style={{ backgroundColor: colors.milk, borderWidth: 1.5, borderColor: colors.line, borderRadius: 20, padding: 14, gap: 12 }}>
          {groups.map((g) => (
            <View key={g.key} style={{ gap: 6 }}>
              <Text variant="small" muted>{g.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {g.options.map((o) => {
                  const on = g.multi ? ((g.value as string[] | null) ?? []).includes(o.value) : g.value === o.value
                  return (
                    <Chip
                      key={o.value}
                      testID={`${testID}-${g.key}-${o.value}`}
                      label={o.label}
                      selected={on}
                      onPress={() => g.onChange(g.multi ? toggleIn(g.value as string[] | null, o.value) : on && g.defaultValue !== o.value ? g.defaultValue ?? null : o.value)}
                    />
                  )
                })}
              </View>
            </View>
          ))}
          <Button testID={`${testID}-apply`} label={resultLabel} onPress={() => set(false)} />
          {chosen.length ? <Button testID={`${testID}-clear`} variant="ghost" label="Clear all" onPress={() => clearAll(groups)} /> : null}
        </View>
      ) : null}
      {chosen.length ? (
        <View testID={`${testID}-chosen`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {chosen.map((c) => (
            <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={`Remove ${c.label}`} onPress={c.remove} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 30, borderRadius: 15, backgroundColor: colors.lichen }}>
              <Text variant="caption" color={colors.mossDeep}>{c.label}</Text>
              <Icon name="close" size={12} color={colors.mossDeep} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
