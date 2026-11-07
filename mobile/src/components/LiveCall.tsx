import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { joinCall } from '@/backend/remoteCall'
import { Button } from './Button'
import { CallFrame } from './CallFrame'
import { Banner } from './Surfaces'
import { Text } from './Text'
import { colors } from '@/theme'

const WORDS: Record<string, { title: string; body: string }> = {
  unavailable: { title: 'Calls aren’t switched on yet', body: 'Your therapist can still talk with you in Chats. Please message them there.' },
  early: { title: 'Not open yet', body: 'A session opens 10 minutes before it starts. Come back then.' },
  late: { title: 'This session has ended', body: 'The call closed when the session ended.' },
  off: { title: 'Video isn’t offered right now', body: 'Please message your therapist in Chats to agree another way to talk.' },
  chat: { title: 'This session is a chat', body: 'Open it from Chats.' },
}

/**
 * The real call for a voice or video session, on the real backend. It asks the server for a private room, then shows it.
 * The camera starts off and nothing is recorded. If it can't start, it says why in plain words and lets the person try again.
 */
export function LiveCall({ sessionId, mode }: { sessionId: string; mode: 'voice' | 'video' | 'chat' }) {
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'ready'; url: string } | { phase: 'error'; code: string; error: string }>({ phase: 'loading' })
  const join = useCallback(async () => {
    setState({ phase: 'loading' })
    const r = await joinCall(sessionId)
    setState(r.ok ? { phase: 'ready', url: r.url } : { phase: 'error', code: r.code, error: r.error })
  }, [sessionId])
  useEffect(() => {
    void join()
  }, [join])

  if (state.phase === 'ready') {
    return (
      <View testID="live-call" style={{ flex: 1, alignSelf: 'stretch' }}>
        <CallFrame url={state.url} />
        <Text variant="caption" color={colors.lichen} align="center" style={{ marginTop: 8 }}>
          {mode === 'video' ? 'Your camera is off until you turn it on. Not recorded.' : 'Voice only. Not recorded.'}
        </Text>
      </View>
    )
  }
  if (state.phase === 'loading') {
    return (
      <View testID="live-call-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text variant="body" color={colors.paper}>
          Opening your private room…
        </Text>
      </View>
    )
  }
  const w = WORDS[state.code]
  return (
    <View testID="live-call-error" style={{ flex: 1, alignSelf: 'stretch', justifyContent: 'center', gap: 12, padding: 8 }}>
      <Banner tone={state.code === 'network' || state.code === 'provider' ? 'clay' : 'sun'} icon="clock" title={w?.title ?? 'We couldn’t open the call'}>
        {w?.body ?? state.error}
      </Banner>
      {state.code === 'early' || state.code === 'network' || state.code === 'provider' ? <Button testID="call-retry" variant="light" label="Try again" onPress={() => void join()} /> : null}
    </View>
  )
}
