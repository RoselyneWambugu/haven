import { useState } from 'react'
import { View } from 'react-native'
import { Portrait } from '@/components/Art'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button } from '@/components/Button'
import { Card, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { nextAvailableLabel } from '@/lib/booking'
import { activeFilterCount, filterTherapists, NO_FILTERS, type DirectoryFilters, type DirectorySort } from '@/lib/directory'
import { modesFor } from '@/lib/content'
import { go } from '@/lib/nav'
import { liveStars, ratingLabel, summarise } from '@/lib/ratings'
import { useDb } from '@/store/db'
import { useNow } from '@/store/useNow'
import { useMoney } from '@/store/useMoney'
import { colors } from '@/theme'

/** A stable empty list, so a selector that falls back to it doesn't look like a change on every render. */
const NONE: never[] = []

const SPECIALISATIONS = ['Anxiety', 'Grief', 'Relationships', 'Work stress', 'Family', 'Loneliness']
const SORTS: { value: DirectorySort; label: string }[] = [
  { value: 'next', label: 'Soonest' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price', label: 'Lowest price' },
  { value: 'language', label: 'My languages' },
]

export default function Therapists() {
  const sessions = useDb((s) => s.sessions)
  const langs = useDb((s) => s.account?.public.languages ?? NONE)
  const money = useMoney()
  const flags = useDb((s) => s.content.flags)
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS)
  const [sort, setSort] = useState<DirectorySort>('next')
  const [open, setOpen] = useState(false)
  const clockNow = useNow(30_000)
  const rows = filterTherapists(THERAPISTS, sessions, filters, clockNow, sort, langs)
  const count = activeFilterCount(filters)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <Screen tab testID="therapists" header={<TopBar avatar />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Therapists</Text>
        <Button testID="my-sessions" label="My sessions" size="sm" icon="cal" variant="quiet" onPress={() => go('/sessions')} />
      </View>
      <Text variant="small" muted>
        Every therapist is licensed and checked by our team. Sessions are 45 minutes, by chat, voice or video.
      </Text>
      <Field testID="dir-search" label="Search" hideLabel placeholder="Search by name or topic" value={filters.query} onChangeText={(query) => setFilters({ ...filters, query })} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip testID="dir-now" label="Available now" icon="clock" selected={filters.when === 'now'} onPress={() => setFilters({ ...filters, when: filters.when === 'now' ? 'any' : 'now' })} />
        <Chip testID="dir-hour" label="Within the hour" selected={filters.when === 'hour'} onPress={() => setFilters({ ...filters, when: filters.when === 'hour' ? 'any' : 'hour' })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip testID="dir-filters" label={count ? `Filters (${count})` : 'Filters'} icon="tool" selected={count > 0} onPress={() => setOpen(true)} />
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
      </View>
      {rows.length ? (
        rows.map(({ therapist: t, slots }) => (
          <Card key={t.id} testID={`therapist-${t.id}`} onPress={() => go(`/therapists/${t.id}`)} accessibilityLabel={`${t.name}, ${t.title}`}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Portrait tone={t.tone} width={64} height={76} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{t.name}</Text>
                <Text variant="small" muted>
                  {t.title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={14} color={colors.sun} />
                  <Text variant="caption">
                    {ratingLabel(summarise(t, liveStars(sessions, t.id)))} · {t.languages.join(', ')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {modesFor(t.modes, flags).map((m) => (
                    <Badge key={m} label={m === 'chat' ? 'Chat' : m === 'voice' ? 'Voice' : 'Video'} tone="plain" />
                  ))}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
              <Text testID={`avail-${t.id}`} variant="small" bold color={slots.length ? colors.mossDeep : colors.muted}>
                {nextAvailableLabel(slots, clockNow) ?? 'No times in the next 2 weeks'}
              </Text>
              <Text variant="small">{money(t.priceKes)}</Text>
            </View>
          </Card>
        ))
      ) : (
        <EmptyState icon="search" title="No therapists match" body="Try removing a filter or searching for something broader.">
          <Button label="Clear filters" onPress={() => setFilters(NO_FILTERS)} />
        </EmptyState>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Filters">
        <Text variant="small" muted>
          Topic
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SPECIALISATIONS.map((s) => (
            <Chip key={s} label={s} selected={filters.specialisation === s} onPress={() => setFilters({ ...filters, specialisation: filters.specialisation === s ? null : s })} />
          ))}
        </View>
        <Text variant="small" muted>
          Language
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['English', 'Kiswahili'].map((l) => (
            <Chip key={l} label={l} selected={filters.languages.includes(l)} onPress={() => setFilters({ ...filters, languages: toggle(filters.languages, l) })} />
          ))}
        </View>
        <Text variant="small" muted>
          Session type
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {modesFor(['chat', 'voice', 'video'] as const, flags).map((m) => (
            <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} selected={filters.modes.includes(m)} onPress={() => setFilters({ ...filters, modes: toggle(filters.modes, m) })} />
          ))}
        </View>
        <Text variant="small" muted>
          Available
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([['any', 'Any time'], ['now', 'Now'], ['hour', 'Within the hour'], ['today', 'Today'], ['week', 'This week']] as const).map(([v, l]) => (
            <Chip key={v} label={l} selected={filters.when === v} onPress={() => setFilters({ ...filters, when: v })} />
          ))}
        </View>
        <Text variant="small" muted>
          Therapist
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([['any', 'Any'], ['woman', 'Woman'], ['man', 'Man']] as const).map(([v, l]) => (
            <Chip key={v} label={l} selected={filters.gender === v} onPress={() => setFilters({ ...filters, gender: v })} />
          ))}
        </View>
        <Button testID="dir-apply" label={`Show ${rows.length} therapist${rows.length === 1 ? '' : 's'}`} onPress={() => setOpen(false)} />
        <Button variant="ghost" label="Clear all" onPress={() => setFilters({ ...NO_FILTERS, query: filters.query })} />
      </Sheet>
    </Screen>
  )
}
