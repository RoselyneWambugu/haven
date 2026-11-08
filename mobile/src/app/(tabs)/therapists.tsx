import { useState } from 'react'
import { View } from 'react-native'
import { Portrait } from '@/components/Art'
import { Badge, Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Button } from '@/components/Button'
import { Banner, Card, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { Pressable } from 'react-native'
import { nextSession } from '@/lib/nextSession'
import { dayAndClock } from '@/lib/time'
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
  useDb((s) => s.directoryVersion)
  const langs = useDb((s) => s.account?.public.languages ?? NONE)
  const languages = useDb((s) => s.content.languages) ?? []
  const money = useMoney()
  const flags = useDb((s) => s.content.flags)
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS)
  const [sort, setSort] = useState<DirectorySort>('next')
  const [open, setOpen] = useState(false)
  const clockNow = useNow(30_000)
  const nextUp = nextSession(sessions, clockNow)
  const nextTherapist = nextUp.next ? THERAPISTS.find((t) => t.id === nextUp.next!.therapistId) : null
  const plan = usePlan()
  const rows = filterTherapists(THERAPISTS, sessions, filters, clockNow, sort, langs)
  const count = activeFilterCount(filters)
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <Screen tab testID="therapists" header={<TopBar avatar />}>
      <Text variant="title">Therapists</Text>
      <Text variant="small" muted>
        Every therapist is licensed and checked by our team. Sessions are 45 minutes, by chat, voice or video.
      </Text>
      {nextUp.next ? (
        <View testID="next-session" style={{ backgroundColor: colors.fern, borderRadius: 22, padding: 16, gap: 4 }}>
          <Text variant="caption" color={colors.lichenDeep}>Your next session</Text>
          <Text variant="h3" color={colors.paper}>{nextTherapist?.name ?? 'Your therapist'}</Text>
          <Text variant="small" color={colors.lichenDeep}>
            {dayAndClock(nextUp.next.start)} · {nextUp.next.mode === 'chat' ? 'Chat' : nextUp.next.mode === 'voice' ? 'Voice' : 'Video'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Pressable testID="my-sessions" accessibilityRole="link" accessibilityLabel={`All my sessions, ${nextUp.upcoming} booked`} onPress={() => go('/sessions')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text variant="small" color={colors.lichenDeep} style={{ textDecorationLine: 'underline' }}>
                {nextUp.upcoming > 1 ? `All my sessions (${nextUp.upcoming})` : 'All my sessions'}
              </Text>
            </Pressable>
            <Pressable testID="open-next-session" accessibilityRole="button" onPress={() => go(`/sessions/${nextUp.next!.id}`)} style={{ backgroundColor: colors.paper, borderRadius: 22, paddingHorizontal: 18, minHeight: 44, justifyContent: 'center' }}>
              <Text variant="label" color={colors.fern}>Open session</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable testID="my-sessions" accessibilityRole="button" accessibilityLabel="My sessions" onPress={() => go('/sessions')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.latte, borderRadius: 20, paddingHorizontal: 14, minHeight: 52 }}>
          <Icon name="cal" size={20} color={colors.ink} />
          <View style={{ flex: 1 }}>
            <Text variant="label">My sessions</Text>
            <Text variant="caption" muted>No upcoming sessions</Text>
          </View>
          <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} color={colors.muted} /></View>
        </Pressable>
      )}
      {!plan ? (
        <Banner testID="book-needs-plan" tone="sun" icon="lock" title="Booking needs a plan">
          You can look at every therapist. A plan lets you book.
        </Banner>
      ) : null}
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
          {languages.map((l) => (
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
