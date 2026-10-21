import { useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { api } from '@/api'
import { Avatar, AVATAR_KINDS } from '@/components/Art'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Text } from '@/components/Text'
import { suggestPenNames } from '@/lib/safety'
import { go } from '@/lib/nav'
import { REMOTE } from '@/backend/client'
import { getDb } from '@/store/db'
import type { AvatarKind, Res } from '@/api'
import { colors } from '@/theme'

/**
 * Pen name and avatar (PRD PRF-1, PRF-9). The name is checked as it is typed, and
 * anything that looks like a real name or contact detail is refused with a kind reason.
 */
export default function PenName() {
  const [name, setName] = useState(getDb().reg?.penName ?? '')
  const [avatar, setAvatar] = useState<AvatarKind>(getDb().reg?.avatar ?? 'moon')
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6))
  const suggestions = useMemo(() => suggestPenNames(seed, 3), [seed])
  const [touched, setTouched] = useState(false)

  const [check, setCheck] = useState<Res | null>(null)
  useEffect(() => {
    const value = name.trim()
    if (!value) return setCheck(null)
    let current = true
    // The real backend is asked after a short pause, so it isn't called on every key press.
    const t = setTimeout(() => {
      void Promise.resolve(api.auth.checkPenName(value)).then((r) => current && setCheck(r))
    }, REMOTE ? 350 : 0)
    return () => {
      current = false
      clearTimeout(t)
    }
  }, [name])
  const error = touched && check && !check.ok ? check.error : null
  const ok = !!check && check.ok

  return (
    <Screen
      testID="pen-name"
      keyboard
      header={<TopBar back />}
      footer={
        <Button
          testID="pen-continue"
          label="Continue"
          disabled={!ok}
          onPress={() => {
            api.auth.saveProfileDraft({ penName: name.trim(), avatar })
            go('/languages')
          }}
        />
      }
    >
      <Text variant="caption" muted>
        Step 4 of 5
      </Text>
      <Text variant="title">Choose a pen name and avatar</Text>
      <Text variant="body" muted>
        This is the only name others will see. Avoid your real name.
      </Text>
      <Field
        testID="pen-input"
        label="Pen name"
        value={name}
        onChangeText={(v) => {
          setName(v)
          setTouched(true)
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        error={error}
        hint={ok ? 'That works.' : 'Letters and numbers, like QuietPine.'}
      />
      <View style={{ gap: 8 }}>
        <Text variant="small" muted>
          Need an idea?
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.map((s) => (
            <Chip
              key={s}
              testID={`pen-suggest-${s}`}
              label={s}
              onPress={() => {
                setName(s)
                setTouched(true)
              }}
            />
          ))}
          <Chip label="More" icon="plus" onPress={() => setSeed((n) => n + 1)} />
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Text variant="small" muted>
          Avatar. There are no photos on Echo.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {AVATAR_KINDS.map((k) => {
            const on = k === avatar
            return (
              <Pressable
                key={k}
                testID={`avatar-${k}`}
                accessibilityRole="radio"
                accessibilityLabel={`Avatar: ${k}`}
                accessibilityState={{ checked: on }}
                onPress={() => setAvatar(k)}
                style={{ padding: 4, borderRadius: 40, borderWidth: 3, borderColor: on ? colors.sun : 'transparent' }}
              >
                <Avatar kind={k} size={54} ring={false} />
              </Pressable>
            )
          })}
        </View>
      </View>
    </Screen>
  )
}
