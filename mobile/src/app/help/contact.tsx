import { useState } from 'react'
import { View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Chip } from '@/components/Controls'
import { Field } from '@/components/Field'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { useDb } from '@/store/db'
import { go, replace } from '@/lib/nav'
import { detectDistress } from '@/lib/safety'

/** Contact a help department. If the words suggest someone is in danger, urgent help is offered first (PRD CRS-3). */
export default function Contact() {
  const departments = useDb((st) => st.content.departments).filter((d) => d.enabled)
  const { dept } = useLocalSearchParams<{ dept?: string }>()
  const [deptId, setDeptId] = useState(dept ?? 'tech')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const distress = detectDistress(`${subject} ${text}`).level !== 'none'

  async function send() {
    const r = await api.tickets.create({ deptId, subject, text })
    if (!r.ok) return setError(r.error)
    replace(`/help/ticket/${r.value.ticket.id}`)
  }

  return (
    <Screen testID="help-contact-screen" keyboard header={<TopBar back title="Contact support" />} footer={<Button testID="ticket-send" label="Send" onPress={send} />}>
      <Text variant="title">Contact support</Text>
      <Text variant="small" muted>
        Which team?
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {departments.map((d) => (
          <Chip key={d.id} label={d.title} selected={deptId === d.id} onPress={() => setDeptId(d.id)} />
        ))}
      </View>
      <Field testID="ticket-subject" label="Subject" value={subject} onChangeText={setSubject} maxLength={80} />
      <Field testID="ticket-text" label="What’s happening?" value={text} onChangeText={setText} multiline minHeight={140} maxLength={1500} hint="Never share your M-Pesa PIN or passwords." />
      {distress ? (
        <Banner tone="sun" icon="heart" title="If you’re in danger or thinking of ending your life">
          Please use urgent help now. It’s free and a person will answer. You can still send this message too.
        </Banner>
      ) : null}
      {distress ? <Button variant="urgent" label="Get urgent help" onPress={() => go('/urgent')} /> : null}
      {error ? <Banner tone="clay">{error}</Banner> : null}
    </Screen>
  )
}
