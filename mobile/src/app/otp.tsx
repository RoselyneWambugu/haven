import { useEffect, useRef, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { CONFIG } from '@/data/config'
import { goBack, replace } from '@/lib/nav'
import { maskPhone } from '@/lib/identity'
import { useDb } from '@/store/db'
import { colors, font } from '@/theme'

const LEN = CONFIG.otpLength

/** Six-digit one-time code. The same screen serves registration, login and "verify it's you". */
export default function Otp() {
  const { purpose = 'login' } = useLocalSearchParams<{ purpose?: 'register' | 'login' | 'reauth' }>()
  const otp = useDb((s) => s.otp)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [left, setLeft] = useState(30)
  const input = useRef<TextInput>(null)

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  function verify(value: string) {
    const r = api.auth.verifyOtp(value)
    if (!r.ok) {
      setError(r.error)
      if (r.code === 'wrong') setCode('')
      return
    }
    switch (r.value.next) {
      case 'create-profile': return replace('/pen-name')
      case 'trust-device': return replace('/trust-device')
      case 'reauth-ok': return goBack('/me/profiles')
      case 'already-registered': return setInfo('This number already has an account. Log in instead.')
      case 'no-account': return setInfo('There is no account for this number. You can create one.')
    }
  }

  function resend() {
    const r = purpose === 'login' ? api.auth.requestOtp('login', otp?.phone ?? '') : api.auth.requestOtp(purpose)
    if (!r.ok) return setError(r.error)
    setError(null)
    setCode('')
    setLeft(30)
  }

  const phone = otp?.phone ? maskPhone(otp.phone) : ''

  return (
    <Screen
      testID="otp"
      keyboard
      header={<TopBar back />}
      footer={<Button testID="otp-verify" label="Verify" disabled={code.length < LEN} onPress={() => verify(code)} />}
    >
      <Text variant="caption" muted>
        {purpose === 'register' ? 'Step 3 of 5' : purpose === 'reauth' ? 'Check it’s you' : 'Log in'}
      </Text>
      <Text variant="title">Enter the {LEN}-digit code</Text>
      <Text variant="body" muted>
        We sent a text message to {phone || 'your phone'}.
      </Text>

      {otp ? (
        <Banner tone="sun" title="Demo mode" testID="demo-code">
          No text message is sent in this demo. Your code is <Text variant="small" bold>{otp.code}</Text>.
        </Banner>
      ) : null}

      <Pressable accessibilityRole="none" onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 8 }}>
        {Array.from({ length: LEN }).map((_, i) => {
          const ch = code[i] ?? ''
          const active = i === Math.min(code.length, LEN - 1)
          return (
            <View
              key={i}
              style={{ width: 46, height: 56, borderRadius: 14, borderWidth: active ? 2 : 1.5, borderColor: error ? colors.clay : active ? colors.moss : colors.line, backgroundColor: ch ? colors.lichen : colors.milk, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="h2">{ch}</Text>
            </View>
          )
        })}
        <TextInput
          ref={input}
          testID="otp-input"
          autoFocus
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, LEN)
            setCode(digits)
            setError(null)
            if (digits.length === LEN) verify(digits)
          }}
          keyboardType="number-pad"
          maxLength={LEN}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          accessibilityLabel={`${LEN}-digit code`}
          caretHidden
          style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', fontFamily: font.sans }}
        />
      </Pressable>

      {error ? (
        <Text variant="small" color={colors.clay} align="center" accessibilityLiveRegion="polite" testID="otp-error">
          {error}
        </Text>
      ) : null}
      {info ? <Banner tone="green">{info}</Banner> : null}

      <View style={{ alignItems: 'center', gap: 6 }}>
        {left > 0 ? (
          <Text variant="small" muted>
            Send a new code in 0:{String(left).padStart(2, '0')}
          </Text>
        ) : (
          <Button label="Send a new code" variant="quiet" size="sm" block={false} onPress={resend} />
        )}
        <Pressable accessibilityRole="button" onPress={() => goBack('/welcome')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="small" color={colors.mossDeep} style={{ textDecorationLine: 'underline' }}>
            Wrong number? Change it
          </Text>
        </Pressable>
        {info ? (
          <Button
            label={info.startsWith('There is no') ? 'Create an account' : 'Log in'}
            variant="quiet"
            size="sm"
            block={false}
            onPress={() => replace(info.startsWith('There is no') ? '/consent' : '/login')}
          />
        ) : null}
      </View>
      <Text variant="caption" muted align="center">
        One account per phone number. After {CONFIG.otpMaxAttempts} wrong tries the code is locked for {CONFIG.otpLockMinutes} minutes.
      </Text>
    </Screen>
  )
}
