import { useState } from 'react'
import { View } from 'react-native'
import { api } from '@/api'
import type { SignInNext } from '@/api/types'
import { REMOTE } from '@/backend/client'
import { Banner } from '@/components/Surfaces'
import { Button } from '@/components/Button'

/**
 * "Continue with Google". Only on the live service: the demo has no Google. `onNext` hears where to go next
 * ('redirecting' needs nothing from the screen: on the web the page is already leaving for Google).
 */
export function GoogleButton({ purpose, label = 'Continue with Google', onNext, testID = 'google-continue' }: {
  purpose: 'login' | 'register' | 'reauth'
  label?: string
  onNext: (next: Exclude<SignInNext, 'redirecting'>) => void
  testID?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!REMOTE) return null

  async function press() {
    setBusy(true)
    setError(null)
    const r = await api.auth.signInWithGoogle(purpose)
    setBusy(false)
    if (!r.ok) {
      if (r.code !== 'cancelled') setError(r.error)
      return
    }
    if (r.value.next !== 'redirecting') onNext(r.value.next)
  }

  return (
    <View style={{ gap: 8 }}>
      <Button testID={testID} variant="quiet" label={busy ? 'Opening Google…' : label} disabled={busy} onPress={press} />
      {error ? <Banner tone="clay">{error}</Banner> : null}
    </View>
  )
}
