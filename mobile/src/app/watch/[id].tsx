import { useCallback, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { VideoView, useVideoPlayer } from 'expo-video'
import { api } from '@/api'
import type { EpisodeComment, EpisodePlay, ReportReason } from '@/api/types'
import { Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Check } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Screen, TopBar } from '@/components/Layout'
import { PersonTap } from '@/components/PersonCard'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Sheet } from '@/components/Sheet'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { durationLabel } from '@/lib/episodes'
import { goBack } from '@/lib/nav'
import { relative } from '@/lib/time'
import { colors } from '@/theme'

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'self-harm', label: 'Encourages self-harm' },
  { value: 'scam', label: 'Scam or asking for money' },
  { value: 'sexual', label: 'Sexual or unwanted content' },
  { value: 'other', label: 'Something else' },
]

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

/** One episode: the video, a like and a dislike, and the comments. Only likes are counted for everyone to see; dislikes are a private signal. */
export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const plan = usePlan()
  const [ep, setEp] = useState<EpisodePlay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const [likes, setLikes] = useState(0)
  const [mine, setMine] = useState<-1 | 0 | 1>(0)
  const [comments, setComments] = useState<EpisodeComment[]>([])
  const [text, setText] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  const [reason, setReason] = useState<ReportReason>('harassment')

  const loadComments = useCallback(async () => {
    if (!id) return
    const r = await api.episodes.comments(id)
    if (r.ok) setComments(r.value)
  }, [id])

  useEffect(() => {
    if (!plan || !id) return
    let live = true
    void api.episodes.play(id).then((r) => {
      if (!live) return
      if (r.ok) {
        setEp(r.value)
        setLikes(r.value.likes)
        setMine(r.value.myReaction)
        setError(null)
      } else setError(r.error)
    })
    void loadComments()
    return () => {
      live = false
    }
  }, [id, plan, tries, loadComments])

  async function react(v: -1 | 1) {
    if (!id) return
    // Tapping the one you already chose takes it back.
    const next: -1 | 0 | 1 = mine === v ? 0 : v
    const r = await api.episodes.react(id, next)
    if (r.ok) {
      setLikes(r.value.likes)
      setMine(r.value.myReaction)
      setWriteError(null)
    } else setWriteError(r.error)
  }

  async function send() {
    if (!id) return
    const r = await api.episodes.addComment(id, text)
    if (!r.ok) return setWriteError(r.error)
    setText('')
    setWriteError(null)
    await loadComments()
  }

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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              testID="episode-like"
              accessibilityRole="button"
              accessibilityLabel={mine === 1 ? 'Remove your like' : 'Like this episode'}
              accessibilityState={{ selected: mine === 1 }}
              onPress={() => react(1)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 44, borderRadius: 22, backgroundColor: mine === 1 ? colors.moss : colors.lichen }}
            >
              <Icon name="thumbup" size={20} color={mine === 1 ? colors.paper : colors.ink} />
              <Text testID="episode-likes" variant="label" color={mine === 1 ? colors.paper : colors.ink}>{likes}</Text>
            </Pressable>
            <Pressable
              testID="episode-dislike"
              accessibilityRole="button"
              accessibilityLabel={mine === -1 ? 'Remove your dislike' : 'Dislike this episode'}
              accessibilityState={{ selected: mine === -1 }}
              onPress={() => react(-1)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 44, borderRadius: 22, backgroundColor: mine === -1 ? colors.mocha : colors.lichen }}
            >
              <Icon name="thumbdown" size={20} color={mine === -1 ? colors.paper : colors.ink} />
            </Pressable>
          </View>
          <Text variant="caption" muted>Only the team sees dislikes. They help us decide what to make next.</Text>

          <Text variant="h3">{comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'No comments yet'}</Text>
          {comments.map((c) => (
            <Card key={c.id} testID={`ecomment-${c.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PersonTap name={c.authorName} avatar={c.authorAvatar} authorKey={c.authorKey} onReport={() => { setReporting(c.id); setReason('harassment') }}>
                  <Avatar kind={c.authorAvatar} size={26} ring={false} />
                  <Text variant="small" bold style={{ flexShrink: 1 }}>{c.authorName}</Text>
                </PersonTap>
                <View style={{ flex: 1 }} />
                <Text variant="caption" muted>{relative(c.at, now())}</Text>
              </View>
              <Text variant="body" style={{ marginTop: 6 }}>{c.text}</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                {c.mine ? (
                  <Pressable testID={`ecomment-remove-${c.id}`} accessibilityRole="button" accessibilityLabel="Remove your comment" onPress={async () => { await api.episodes.removeComment(c.id); await loadComments() }} style={{ minHeight: 36, justifyContent: 'center' }}>
                    <Text variant="caption" muted>Remove</Text>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" accessibilityLabel="Report comment" onPress={() => { setReporting(c.id); setReason('harassment') }} style={{ minHeight: 36, justifyContent: 'center' }}>
                    <Text variant="caption" muted>Report</Text>
                  </Pressable>
                )}
              </View>
            </Card>
          ))}
          {writeError ? <Banner tone="clay">{writeError}</Banner> : null}
          <Field testID="episode-comment-input" label="Add a comment" placeholder="Add a kind comment" value={text} onChangeText={(v) => { setText(v); setWriteError(null) }} maxLength={1000} multiline minHeight={70} hint="No phone numbers, links or addresses." />
          <Button testID="episode-comment-send" label="Post comment" disabled={!text.trim()} onPress={send} />
        </>
      ) : error ? null : (
        <Text variant="small" muted>Opening the episode…</Text>
      )}

      <Sheet visible={!!reporting} onClose={() => setReporting(null)} title="Report this comment">
        <Text variant="small" muted>A person on our team reviews every report. They are not told who reported.</Text>
        {REASONS.map((r) => (
          <Check key={r.value} checked={reason === r.value} label={r.label} onPress={() => setReason(r.value)} />
        ))}
        <Button
          testID="episode-report-submit"
          label="Send report"
          onPress={async () => {
            if (reporting) await api.episodes.reportComment(reporting, reason)
            setReporting(null)
          }}
        />
      </Sheet>
    </Screen>
  )
}
