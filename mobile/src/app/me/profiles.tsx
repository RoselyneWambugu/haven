import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { api, SPOKEN_LANGUAGES } from '@/api'
import { AVATAR_KINDS, Avatar } from '@/components/Art'
import { Button } from '@/components/Button'
import { Chip, Segmented } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Sheet } from '@/components/Sheet'
import { Banner, Card, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { ageBandLabel, formatPhone } from '@/lib/identity'
import { go } from '@/lib/nav'
import { dayLong } from '@/lib/time'
import { useDb } from '@/store/db'
import { colors } from '@/theme'

/**
 * Public and private profiles side by side in one place. Public is what others see. Private holds real details
 * and needs a phone code to open, valid for 5 minutes (PRD PRF-1 to PRF-9).
 */
export default function Profiles() {
  const account = useDb((s) => s.account)
  const TOPICS = useDb((s) => s.content.topics)
  const reauthUntil = useDb((s) => s.reauthUntil)
  const [tab, setTab] = useState<'public' | 'private'>('public')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  if (!account) return null
  const p = account.public
  const unlocked = reauthUntil > now()
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function verify() {
    const r = await api.auth.requestOtp('reauth', account!.private.phone)
    if (r.ok) go('/otp?purpose=reauth')
  }

  return (
    <Screen testID="profiles" header={<TopBar back title="My profiles" />}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }]} />
      {tab === 'public' ? (
        <>
          <Text variant="small" muted>
            This is everything other people can see about you.
          </Text>
          <Card tone="lichen" testID="public-preview">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar kind={p.avatar} size={56} />
              <View>
                <Text variant="h3">{p.penName}</Text>
                <Text variant="small" color={colors.mossDeep}>
                  {ageBandLabel(p.ageBand)} · {p.languages.join(', ')}
                </Text>
              </View>
            </View>
          </Card>
          <Button testID="edit-pen-name" variant="quiet" label="Change pen name" icon="pencil" onPress={() => { setName(p.penName); setNameError(null); setEditing(true) }} />
          <Text variant="small" muted>
            Avatar
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {AVATAR_KINDS.map((k) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityLabel={`Avatar: ${k}`} accessibilityState={{ checked: k === p.avatar }} onPress={() => api.auth.setAvatar(k)} style={{ padding: 3, borderRadius: 34, borderWidth: 3, borderColor: k === p.avatar ? colors.sun : 'transparent' }}>
                <Avatar kind={k} size={46} ring={false} />
              </Pressable>
            ))}
          </View>
          <Text variant="small" muted>
            Languages (used for matching)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPOKEN_LANGUAGES.map((l) => (
              <Chip key={l} label={l} selected={p.languages.includes(l)} onPress={() => api.auth.setLanguages(toggle(p.languages, l))} />
            ))}
          </View>
          <Text variant="small" muted>
            Topics (never used for matching)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOPICS.map((t) => (
              <Chip key={t} label={t} selected={p.topics.includes(t)} onPress={() => api.auth.setTopics(toggle(p.topics, t))} />
            ))}
          </View>
        </>
      ) : unlocked ? (
        <>
          <Banner tone="green" icon="lock">
            Only you can see this. Nobody else ever sees these details. Staff see them only to protect your account, and every view is logged.
          </Banner>
          <View testID="private-details">
            <Row title="Full name" sub={account.private.fullName} />
            <Row title="Phone" sub={formatPhone(account.private.phone)} />
            <Row title="Date of birth" sub={dayLong(new Date(account.private.dob).getTime())} />
            <Row title="Email" sub={account.private.email || 'Not added'} />
            <Row title="ID" sub={account.private.idVerified ? 'Verified' : 'Not verified'} last />
          </View>
          <Button variant="quiet" label="Ask us to correct something" onPress={() => go('/help/contact?dept=account')} />
        </>
      ) : (
        <>
          <Banner tone="green" icon="lock" title="Your real details">
            Your name, phone, date of birth and ID live here. We ask for a quick code before showing them.
          </Banner>
          <Button testID="verify-private" label="Verify it’s you" onPress={verify} />
        </>
      )}
      <Sheet visible={editing} onClose={() => setEditing(false)} title="Change pen name">
        <Text variant="small" muted>
          You can change it once every 30 days. Your chats keep working.
        </Text>
        <Field testID="new-pen-name" label="Pen name" value={name} onChangeText={(v) => { setName(v); setNameError(null) }} autoCapitalize="none" maxLength={20} error={nameError} />
        <Button
          testID="save-pen-name"
          label="Save"
          onPress={async () => {
            const r = await api.auth.changePenName(name.trim())
            if (!r.ok) return setNameError(r.error)
            setEditing(false)
          }}
        />
      </Sheet>
    </Screen>
  )
}
