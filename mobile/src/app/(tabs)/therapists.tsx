import { useState } from 'react'
import { View } from 'react-native'
import { Portrait } from '@/components/Art'
import { Badge } from '@/components/Controls'
import { Icon } from '@/components/Icon'
import { usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { SearchFilter } from '@/components/SearchFilter'
import { Button } from '@/components/Button'
import { Banner, Card, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { Pressable } from 'react-native'
import { nextSession } from '@/lib/nextSession'
import { dayAndClock } from '@/lib/time'
import { THERAPISTS } from '@/data/seed'
import { nextAvailableLabel } from '@/lib/booking'
import { filterTherapists, NO_FILTERS, type DirectoryFilters, type DirectorySort } from '@/lib/directory'
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
  const clockNow = useNow(30_000)
  const nextUp = nextSession(sessions, clockNow)
  const nextTherapist = nextUp.next ? THERAPISTS.find((t) => t.id === nextUp.next!.therapistId) : null
  const plan = usePlan()
  const rows = filterTherapists(THERAPISTS, sessions, filters, clockNow, sort, langs)
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
      <SearchFilter
        testID="dir"
        placeholder="Search by name or topic"
        query={filters.query}
        onQuery={(query) => setFilters({ ...filters, query })}
        resultLabel={`Show ${rows.length} therapist${rows.length === 1 ? '' : 's'}`}
        groups={[
          { key: 'sort', title: 'Sort by', options: SORTS, value: sort, defaultValue: 'next', onChange: (v) => setSort((v ?? 'next') as DirectorySort) },
          { key: 'when', title: 'Available', options: [{ value: 'any', label: 'Any time' }, { value: 'now', label: 'Available now' }, { value: 'hour', label: 'Within the hour' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }], value: filters.when, defaultValue: 'any', onChange: (v) => setFilters({ ...filters, when: (v ?? 'any') as DirectoryFilters['when'] }) },
          { key: 'topic', title: 'Topic', options: SPECIALISATIONS.map((x) => ({ value: x, label: x })), value: filters.specialisation, defaultValue: null, onChange: (v) => setFilters({ ...filters, specialisation: v as string | null }) },
          { key: 'language', title: 'Language', multi: true, options: languages.map((x) => ({ value: x, label: x })), value: filters.languages, onChange: (v) => setFilters({ ...filters, languages: (v as string[]) ?? [] }) },
          { key: 'mode', title: 'Session type', multi: true, options: modesFor(['chat', 'voice', 'video'] as const, flags).map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) })), value: filters.modes, onChange: (v) => setFilters({ ...filters, modes: (v as string[]) as DirectoryFilters['modes'] }) },
          { key: 'gender', title: 'Therapist', options: [{ value: 'any', label: 'Any' }, { value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }], value: filters.gender, defaultValue: 'any', onChange: (v) => setFilters({ ...filters, gender: (v ?? 'any') as DirectoryFilters['gender'] }) },
        ]}
      />
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

    </Screen>
  )
}
