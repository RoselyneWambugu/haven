/** One group of choices in the filter dropdown: a sort order, or something to narrow a list by. */
export interface FilterGroup {
  key: string
  title: string
  /** Many choices can be on at once (languages). Otherwise one is chosen at a time. */
  multi?: boolean
  options: { value: string; label: string }[]
  /** The chosen value, or the chosen values when `multi`. */
  value: string | string[] | null
  /** What "no choice" is: null, or a value such as 'any'. A group sitting on it adds nothing to the count. */
  defaultValue?: string | null
  onChange: (value: string | string[] | null) => void
}

/** The choices that are not on their default, as removable chips and a count. */
export function activeChoices(groups: FilterGroup[]): { key: string; label: string; remove: () => void }[] {
  const out: { key: string; label: string; remove: () => void }[] = []
  for (const g of groups) {
    const label = (v: string) => g.options.find((o) => o.value === v)?.label ?? v
    if (g.multi) {
      for (const v of (g.value as string[] | null) ?? []) out.push({ key: `${g.key}:${v}`, label: label(v), remove: () => g.onChange(((g.value as string[]) ?? []).filter((x) => x !== v)) })
    } else if (g.value !== null && g.value !== undefined && g.value !== (g.defaultValue ?? null)) {
      out.push({ key: g.key, label: g.key === 'sort' ? `Sorted: ${label(g.value as string)}` : label(g.value as string), remove: () => g.onChange(g.defaultValue ?? null) })
    }
  }
  return out
}

/** Turns on or off one value of a multiple-choice group. */
export const toggleIn = (list: string[] | null, v: string): string[] => ((list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v])

/** Puts every group back on its default. */
export function clearAll(groups: FilterGroup[]): void {
  for (const g of groups) g.onChange(g.multi ? [] : g.defaultValue ?? null)
}
