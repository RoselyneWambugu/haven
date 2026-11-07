import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { api } from '@/api'
import type { EpisodePlay } from '@/api/types'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { durationLabel } from '@/lib/episodes'
import { goBack } from '@/lib/nav'

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false
  })
  return (
    <VideoView
      testID="episode-player"
      player={player}
      nativeControls
      fullscreenOptions={{ enable: true }}
      contentFit="contain"
      style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: '#000' }}
    />
  )
}

/** One episode: the video with its controls, the title and what it is about. The video link is private and short-lived. */
export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const plan = usePlan()
  const [ep, setEp] = useState<EpisodePlay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!plan || !id) return
    let live = true
    void api.episodes.play(id).then((r) => {
      if (!live) return
      if (r.ok) {
        setEp(r.value)
        setError(null)
      } else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [id, plan, tries])

  if (!plan) {
    return (
      <Screen testID="episode-locked" header={<TopBar back />}>
        <PlanGate what="Watch" />
      </Screen>
    )
  }
  return (
    <Screen testID="episode" header={<TopBar back />}>
      {error ? (
        <View style={{ gap: 12 }}>
          <Banner tone="clay">{error}</Banner>
          <Button variant="quiet" label="Try again" onPress={() => setTries((n) => n + 1)} />
          <Button variant="ghost" label="Back to Watch" onPress={() => goBack('/watch')} />
        </View>
      ) : null}
      {ep ? (
        <>
          <Player url={ep.videoUrl} />
          <Text variant="title">{ep.title}</Text>
          {durationLabel(ep.durationSec) ? <Text variant="caption" muted>{durationLabel(ep.durationSec)}</Text> : null}
          <Text variant="body">{ep.blurb}</Text>
        </>
      ) : error ? null : (
        <Text variant="small" muted>Opening the episode…</Text>
      )}
    </Screen>
  )
}
