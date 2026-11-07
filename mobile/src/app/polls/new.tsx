import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { PlanGate, usePlan } from '@/components/PlanGate'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { replace } from '@/lib/nav'
import { cleanOptions, POLL_DAYS, POLL_LIMITS, validatePoll } from '@/lib/polls'
import { useDb } from '@/store/db'

/** Ask a poll: one question, two to four answers. Names and contact details are stopped before it is sent. It closes after a week. */
export default function NewPoll() {
  const first = useDb((s) => !s.account?.hasPostedBefore)
  const plan = usePlan()
  const forumOn = useDb((s) => s.content.flags.forum)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState<string | null>(null)

  const ready = question.trim().length >= POLL_LIMITS.minQuestion && cleanOptions(options).length >= POLL_LIMITS.minOptions
  const problem = ready ? validatePoll(question, options) : null

  async function ask() {
    setError(null)
    const err = validatePoll(question, options)
    if (err) return setError(err)
    const r = await api.forum.createPoll({ question, options })
    if (!r.ok) return setError(r.error)
    replace(r.value.pending ? '/forum/mine' : `/forum/${r.value.post.id}`)
  }

  return (
    <Screen
      testID="poll-new-screen"
      keyboard
      header={<TopBar back title="Ask a poll" />}
      footer={<Button testID="poll-submit" label="Ask" disabled={!plan || !forumOn || !ready} onPress={ask} />}
    >
      {!plan ? <PlanGate what="Asking a poll" /> : null}
      <Banner tone="green" icon="shield" title="Keep it light and kind">
        One question, two to four answers. Leave out names, phone numbers and links. It stays open for {POLL_DAYS} days, everyone votes once, and nobody sees who voted.
      </Banner>
      <Field testID="poll-question" label="Your question" value={question} onChangeText={(v) => { setQuestion(v); setError(null) }} maxLength={POLL_LIMITS.maxQuestion} />
      {options.map((o, i) => (
        <Field
          key={i}
          testID={`poll-option-${i}`}
          label={`Answer ${i + 1}`}
          value={o}
          onChangeText={(v) => { setOptions((cur) => cur.map((x, j) => (j === i ? v : x))); setError(null) }}
          maxLength={POLL_LIMITS.maxOption}
        />
      ))}
      {options.length < POLL_LIMITS.maxOptions ? <Button testID="poll-add-option" variant="quiet" size="sm" label="Add another answer" onPress={() => setOptions((cur) => [...cur, ''])} /> : null}
      {problem ? (
        <Banner testID="poll-problem" tone="sun" icon="pencil">
          {problem}
        </Banner>
      ) : null}
      {error && !problem ? <Banner tone="clay">{error}</Banner> : null}
      {!forumOn ? (
        <Banner tone="sun" icon="clock" title="Posting is paused">
          You can write it, but it can’t be asked until posting is turned back on.
        </Banner>
      ) : null}
      <View>
        <Text variant="caption" muted>
          {first ? 'Your first post is checked before it goes live. That usually takes a few minutes. ' : ''}Anyone can report a poll.
        </Text>
      </View>
    </Screen>
  )
}
