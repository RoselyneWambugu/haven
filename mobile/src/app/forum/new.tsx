import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { describeDetail, detectBlockedContent, detectDistress, detectIdentifyingDetails, explainBlock } from '@/lib/safety'
import { replace } from '@/lib/nav'
import { useLocalSearchParams } from 'expo-router'
import { spaceById } from '@/data/spaces'
import { useDb } from '@/store/db'

/**
 * Write a post. Blocked content is stopped with a reason. Possibly identifying details (a place, school,
 * workplace or name) get a gentle heads-up the writer can ignore. Signs of distress offer help, never block (PRD FRM-2 to FRM-5, CRS-3).
 */
export default function NewPost() {
  const { space: spaceId } = useLocalSearchParams<{ space?: string }>()
  const space = spaceById(spaceId)
  const joined = useDb((s) => (space ? s.spaces.includes(space.id) : true))
  const first = useDb((s) => !s.account?.hasPostedBefore)
  const TOPICS = useDb((s) => s.content.topics)
  const forumOn = useDb((s) => s.content.flags.forum)
  const plan = usePlan()
  const [topic, setTopic] = useState<string>('Wellbeing')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const all = `${title}\n${body}`
  const blocked = detectBlockedContent(all)
  const details = detectIdentifyingDetails(all)
  const distress = detectDistress(all).level

  async function publish() {
    const r = await api.forum.create({ topic, title, body, space: space?.id })
    if (!r.ok) {
      setConfirm(false)
      return setError(r.error)
    }
    setConfirm(false)
    replace(r.value.pending ? '/forum/mine' : `/forum/${r.value.post.id}`)
  }

  function submit() {
    setError(null)
    if (blocked.blocked) return setError(explainBlock(blocked.reasons))
    if (details.length) return setConfirm(true)
    publish()
  }

  return (
    <Screen
      testID="forum-new-screen"
      keyboard
      header={<TopBar back title="New post" />}
      footer={<Button testID="post-submit" label="Post" disabled={!plan || !title.trim() || body.trim().length < 10} onPress={submit} />}
    >
      {!plan ? <PlanGate what="Posting" /> : null}
      {space ? (
        <Banner testID="posting-in-space" tone="green" icon="shield" title={`Posting in ${space.name}`}>
          {space.sensitive ? 'Every post in this space is checked before it goes live. That usually takes a few minutes.' : 'Only members of this space see it here, not the general community.'}
          {joined ? '' : ' Join the space first to post.'}
        </Banner>
      ) : (
        <>
          <Text variant="small" muted>
            Topic
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOPICS.map((t) => (
              <Chip key={t} label={t} selected={topic === t} onPress={() => setTopic(t)} />
            ))}
          </View>
        </>
      )}
      <Field testID="post-title" label="Title" value={title} onChangeText={setTitle} maxLength={90} />
      <Field testID="post-body" label="What’s on your mind?" value={body} onChangeText={setBody} multiline minHeight={160} maxLength={2000} hint="Posted under your pen name. No links, phone numbers or addresses." />
      {!forumOn ? (
        <Banner tone="sun" icon="clock" title="Posting is paused">
          You can write your post, but it can’t be shared until posting is turned back on.
        </Banner>
      ) : null}
      {first && !space?.sensitive ? (
        <Banner tone="green" icon="shield">
          Your first post is checked before it goes live. That usually takes a few minutes.
        </Banner>
      ) : null}
      {distress !== 'none' ? (
        <Banner tone="sun" icon="heart" title="It sounds like things are heavy">
          You can still post. If you want to talk to someone now, urgent help is free. Tap “Urgent help” at the top.
        </Banner>
      ) : null}
      {blocked.blocked ? (
        <Banner tone="clay" icon="shield" title="This can’t be posted yet">
          {explainBlock(blocked.reasons)}
        </Banner>
      ) : null}
      {error && !blocked.blocked ? (
        <Banner tone="clay" testID="post-error">
          {error}
        </Banner>
      ) : null}
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="This could identify you" testID="identify-sheet">
        <Text variant="small">Your post mentions: {details.map(describeDetail).join(', ')}. Others could use this to work out who you are.</Text>
        <Button testID="post-edit" label="Edit my post" onPress={() => setConfirm(false)} />
        <Button testID="post-anyway" variant="ghost" label="Post anyway" onPress={publish} />
      </Sheet>
    </Screen>
  )
}
