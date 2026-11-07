import { getDb } from '@/store/db'
import { registrationRoute } from '@/lib/registration'
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
      // A link from an email carries a token (confirm your email, reset your password); a return from Google carries a code.
      const r = url.includes('token_hash=') ? await api.auth.finishEmailLink(url) : await api.auth.finishGoogleRedirect(url)
      if (!r.ok) {
        if (r.code !== 'stale' && r.code !== 'unavailable') showToast(r.error)
        // A therapist or staff sign-in that did not match goes back to where it started; a bad email link goes to ask for a new one.
        return router.replace((r.code === 'link' ? '/forgot-password' : r.code === 'not-therapist' ? '/portal/sign-in' : r.code === 'not-staff' ? '/staff/sign-in' : r.code === 'setup' ? '/staff/sign-in?setup=1' : '/') as never)
      }
      const to = { 'trust-device': '/trust-device', apply: '/portal/apply', consent: registrationRoute(getDb().reg), register: registrationRoute(getDb().reg), 'reauth-ok': '/me/profiles', 'reset-password': '/reset-password', linked: '/settings/sign-in-methods', portal: '/portal/today', 'mobile-app': '/mobile-app?done=email', admin: '/staff/overview', redirecting: '/' }[r.value.next]
      router.replace(to as never)
    })()
  }, [])
  return (
    <View testID="auth-callback" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="body" muted>Finishing sign-in…</Text>
    </View>
  )
}
