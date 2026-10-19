import { useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Radio } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { resetTo } from '@/lib/nav'

type Option = 'device' | 'number' | 'other'

/**
 * Lost phone or new number (PRD ACC-17, D42). The account stays locked and nothing is deleted
 * while a person checks. In this demo the request is only acknowledged.
 */
export default function Recovery() {
  const [option, setOption] = useState<Option>('device')
  const [sent, setSent] = useState(false)
  return (
    <Screen
      testID="recovery"
      header={<TopBar back />}
      footer={
        sent ? (
          <Button label="Back to log in" onPress={() => resetTo('/login')} />
        ) : (
          <Button testID="recovery-continue" label="Continue" onPress={() => setSent(true)} />
        )
      }
    >
      <Text variant="title">Get back into your account</Text>
      <Text variant="body" muted>
        Choose what fits. Your chats and data stay untouched.
      </Text>
      {sent ? (
        <View style={{ gap: 12 }} testID="recovery-sent">
          <Banner tone="green" icon="check" title="We’ve got your request">
            {option === 'device'
              ? 'Open Echo on your other device and approve this sign-in. It will ask you to confirm.'
              : option === 'number'
                ? 'A person will check your ID and a selfie against the ones you registered with. It usually takes a few days. We’ll text your new number when it’s done.'
                : 'Our support team will contact you in the app or by text.'}
          </Banner>
          <Text variant="small" muted>
            While we check, the account stays locked. Nobody can use it, and nothing is deleted.
          </Text>
        </View>
      ) : (
        <>
          <Radio testID="rec-device" selected={option === 'device'} onPress={() => setOption('device')} label="I’m signed in on another device" sub="Approve this sign-in from there." />
          <Radio testID="rec-number" selected={option === 'number'} onPress={() => setOption('number')} label="I have a new phone number" sub="Confirm it’s you with your ID and a selfie. A person reviews it." />
          <Radio testID="rec-other" selected={option === 'other'} onPress={() => setOption('other')} label="Something else" sub="Contact support with details." />
          <Banner tone="green" icon="lock">
            While we check, the account stays locked. Nobody can use it, and nothing is deleted.
          </Banner>
          <Text variant="caption" muted>
            Your ID is matched to the one you registered with. Staff only see what they need, and every view is logged.
          </Text>
        </>
      )}
    </Screen>
  )
}
