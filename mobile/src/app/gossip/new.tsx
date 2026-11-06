import { useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { detectNames, explainNames, GOSSIP_RULES, GOSSIP_SPACE, GOSSIP_TOPIC } from '@/lib/gossip'
import { detectBlockedContent, explainBlock } from '@/lib/safety'
import { replace } from '@/lib/nav'
import { useDb } from '@/store/db'

/** Share a piece of gossip. Names are stopped before it is sent, and so are contact details. Everyone can react; nobody can reply. */
export default function NewGossip() {
  const plan = usePlan()
  const forumOn = useDb((s) => s.content.flags.forum)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const all = `${title}\n${body}`
  const names = detectNames(all)
  const blocked = detectBlockedContent(all)

  async function share() {
    setError(null)
    if (blocked.blocked) return setError(explainBlock(blocked.reasons))
    if (names.length) return setError(explainNames(names))
    const r = await api.forum.create({ topic: GOSSIP_TOPIC, title, body, space: GOSSIP_SPACE })
    if (!r.ok) return setError(r.error)
    replace(r.value.pending ? '/forum/mine' : `/forum/${r.value.post.id}`)
  }

  return (
    <Screen
      testID="gossip-new-screen"
      keyboard
      header={<TopBar back title="Share gossip" />}
      footer={<Button testID="gossip-submit" label="Share" disabled={!plan || !forumOn || !title.trim() || body.trim().length < 10} onPress={share} />}
    >
      {!plan ? <PlanGate what="Sharing gossip" /> : null}
      <Banner tone="green" icon="shield" title="Before you share">
        {GOSSIP_RULES.join(' ')}
      </Banner>
      <Field testID="gossip-title" label="The headline" value={title} onChangeText={(v) => { setTitle(v); setError(null) }} maxLength={90} />
      <Field testID="gossip-body" label="What’s the talk?" value={body} onChangeText={(v) => { setBody(v); setError(null) }} multiline minHeight={140} maxLength={600} hint="Posted under your pen name. Others can react but not reply." />
      {names.length && !blocked.blocked ? (
        <Banner testID="gossip-names" tone="sun" icon="pencil">
          {explainNames(names)}
        </Banner>
      ) : null}
      {blocked.blocked ? (
        <Banner tone="clay" icon="shield">
          {explainBlock(blocked.reasons)}
        </Banner>
      ) : null}
      {error && !names.length && !blocked.blocked ? <Banner tone="clay">{error}</Banner> : null}
      {!forumOn ? (
        <Banner tone="sun" icon="clock" title="Posting is paused">
          You can write it, but it can’t be shared until posting is turned back on.
        </Banner>
      ) : null}
      <Text variant="caption" muted>
        A member’s first post is checked before it goes live. Anyone can report a post.
      </Text>
    </Screen>
  )
}
