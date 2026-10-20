import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import { Avatar, Ripple } from '@/components/Art'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Banner, Card } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { ageBandLabel } from '@/lib/identity'
import { go, goBack, replace } from '@/lib/nav'
import { planState } from '@/lib/plan'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/**
 * Matching (PRD MAT-1 to MAT-8). Starts a search on arrival if one isn't running,
 * shows a calm waiting state, then reveals the person with pen name, avatar, languages and age range only.
 */
export default function Match() {
  const state = useDb((s) => s.match)
  const conversations = useDb((s) => s.conversations)
  const sub = useDb((s) => s.subscription)
  const open = useDb((s) => s.account?.public.openToChats ?? true)
  const [error, setError] = useState<{ text: string; code?: string } | null>(null)

  useEffect(() => {
    if (state.state === 'idle') {
      const r = api.match.start()
      if (!r.ok) setError({ text: r.error, code: r.code })
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const found = state.state === 'found' ? conversations.find((c) => c.id === state.conversationId) : null
  const needsPlan = planState(sub, now()) === 'none' || planState(sub, now()) === 'lapsed'

  if (found?.peer) {
    const p = found.peer
    return (
      <Screen
        testID="match-found"
        header={<TopBar logo />}
        footer={
          <>
            <Button
              testID="match-say-hello"
              label="Say hello"
              onPress={() => {
                api.match.acknowledgeFound()
                replace(`/chat/${found.id}`)
              }}
            />
            <Button
              testID="match-not-now"
              variant="ghost"
              label="Not now"
              onPress={() => {
                api.match.acknowledgeFound()
                goBack('/chats')
              }}
            />
          </>
        }
      >
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
          <Text variant="small" muted>
            You’re matched with
          </Text>
          <Avatar kind={p.avatar} size={96} />
          <Text variant="title" align="center">
            {p.penName}
          </Text>
        </View>
        <Card tone="lichen">
          <Text variant="small">Speaks {p.languages.join(', ')}</Text>
          <Text variant="small">Age range {ageBandLabel(p.ageBand)}</Text>
          <Text variant="caption" muted style={{ marginTop: 6 }}>
            We matched you on language and age range. That is all they know about you too.
          </Text>
        </Card>
        <Banner tone="green" icon="shield">
          No links, phone numbers or addresses can be sent here. Report or block at any time from the chat.
        </Banner>
      </Screen>
    )
  }

  if (error || state.state === 'paused') {
    const text = error?.text ?? 'Matching is paused.'
    const code = error?.code ?? 'paused-matching'
    return (
      <Screen testID="match-blocked" header={<TopBar back />}>
        <Text variant="title">We couldn’t start a search</Text>
        <Banner tone="sun" icon="lock">
          {text}
        </Banner>
        {code === 'needs-plan' || (needsPlan && state.state !== 'paused') ? <Button testID="match-see-plans" label="See plans" onPress={() => go('/plans')} /> : null}
        {code === 'paused-matching' || state.state === 'paused' || !open ? (
          <Button
            testID="match-resume"
            label="Turn matching back on"
            onPress={() => {
              api.match.setOpenToChats(true)
              setError(null)
              const r = api.match.start()
              if (!r.ok) setError({ text: r.error, code: r.code })
            }}
          />
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen
      testID="match-searching"
      header={<TopBar back />}
      footer={
        <>
          <Button
            testID="match-stop"
            variant="ghost"
            label="Stop looking"
            onPress={() => {
              api.match.cancelSearch()
              goBack('/chats')
            }}
          />
          <Text variant="caption" muted align="center">
            You can leave this screen. We’ll tell you when you’re matched.
          </Text>
        </>
      }
    >
      <View style={{ height: 240, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
        <Ripple size={190} color={colors.lichenDeep} />
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h2" color={colors.paper}>
            e
          </Text>
        </View>
      </View>
      <Text variant="title" align="center">
        Finding someone for you
      </Text>
      <Text variant="body" muted align="center">
        We’re looking for a person who speaks your language and is in a similar age range. It can take a little while.
      </Text>
    </Screen>
  )
}
