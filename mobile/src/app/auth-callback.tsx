import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/api'
import { Text } from '@/components/Text'
import { showToast } from '@/store/toast'

/**
 * Where Google sends the browser back to. It finishes the sign-in and moves on. On a phone the sign-in finishes inside the app,
 * so a visit here with nothing to do goes straight back to the start.
 */
export default function AuthCallback() {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    void (async () => {
      const url = Platform.OS === 'web' ? globalThis.location.href : ''
      const r = await api.auth.finishGoogleRedirect(url)
      if (!r.ok) {
        if (r.code !== 'stale' && r.code !== 'unavailable') showToast(r.error)
        return router.replace('/' as never)
      }
      const to = { 'trust-device': '/trust-device', consent: '/consent', register: '/register', 'reauth-ok': '/me/profiles', redirecting: '/' }[r.value.next]
      router.replace(to as never)
    })()
  }, [])
  return (
    <View testID="auth-callback" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body" muted>Finishing sign-in…</Text>
    </View>
  )
}
