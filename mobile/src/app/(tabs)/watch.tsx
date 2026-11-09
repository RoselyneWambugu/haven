import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import { api } from '@/api'
import type { Episode } from '@/api/types'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { LoadingBar } from '@/components/LoadingBar'
import { Screen, TopBar } from '@/components/Layout'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Banner, EmptyState } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { durationLabel, newestFirst } from '@/lib/episodes'
import { go } from '@/lib/nav'
import { relative } from '@/lib/time'
import { colors } from '@/theme'

function Poster({ e, height }: { e: Episode; height: number }) {
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.fern, alignItems: 'center', justifyContent: 'center' }}>
      {e.posterUrl ? <Image accessibilityIgnoresInvertColors source={{ uri: e.posterUrl }} style={{ position: 'absolute', width: '100%', height }} resizeMode="cover" /> : null}
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(250,246,236,0.9)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="play" size={24} color={colors.fern} />
      </View>
    </View>
  )
}

/** Watch: podcast video episodes. The newest is shown large; the rest follow as a list. Needs a plan, like the rest of Echo. */
export default function Watch() {
  const plan = usePlan()
  const [list, setList] = useState<Episode[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await api.episodes.list()
    if (r.ok) {
      setList(r.value)
      setError(null)
    } else if (r.code !== 'needs-plan') setError(r.error)
  }, [])
  useEffect(() => {
    if (plan) void load()
  }, [plan, load])

  const { latest, earlier } = newestFirst(list ?? [])
  return (
    <Screen tab testID="watch" header={<TopBar avatar />}>
      <Text variant="title">Watch</Text>
      <Text variant="small" muted>
        Conversations from the Echo team. New episodes land here.
      </Text>
      {!plan ? <PlanGate what="Watch" /> : null}
      {plan && error ? (
        <Banner tone="clay">
          {error}
        </Banner>
      ) : null}
      {plan && error ? <Button variant="quiet" label="Try again" onPress={load} /> : null}
      {plan && !list && !error ? <View style={{ alignItems: 'center', paddingVertical: 40 }}><LoadingBar /></View> : null}
      {plan && list && list.length === 0 ? <EmptyState icon="video" title="No episodes yet" body="The first episode is on its way. Check back soon." /> : null}
      {plan && latest ? (
        <Pressable testID={`episode-${latest.id}`} accessibilityRole="button" accessibilityLabel={`Play ${latest.title}`} onPress={() => go(`/watch/${latest.id}`)} style={{ gap: 8 }}>
          <Poster e={latest} height={190} />
          <Text variant="h3">{latest.title}</Text>
          <Text variant="small" muted numberOfLines={3}>{latest.blurb}</Text>
          <Text variant="caption" muted>
            {[durationLabel(latest.durationSec), relative(latest.publishedAt, now()), `${latest.likes} likes`, `${latest.comments} comments`].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ) : null}
      {plan && earlier.length ? <Text variant="h3" style={{ marginTop: 8 }}>Earlier episodes</Text> : null}
      {plan
        ? earlier.map((e) => (
            <Pressable key={e.id} testID={`episode-${e.id}`} accessibilityRole="button" accessibilityLabel={`Play ${e.title}`} onPress={() => go(`/watch/${e.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 120 }}>
                <Poster e={e} height={72} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" numberOfLines={2}>{e.title}</Text>
                <Text variant="caption" muted>
                  {[durationLabel(e.durationSec), relative(e.publishedAt, now()), `${e.likes} likes`].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))
        : null}
    </Screen>
  )
}
