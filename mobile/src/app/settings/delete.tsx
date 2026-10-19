import { useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Check } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { CONFIG } from '@/data/config'
import { resetTo } from '@/lib/nav'

export default function DeleteAccount() {
  const [keepPosts, setKeepPosts] = useState(false)
  const [sure, setSure] = useState(false)
  return (
    <Screen
      testID="delete-account"
      header={<TopBar back title="Delete account" />}
      footer={
        <Button
          testID="delete-confirm"
          variant="danger"
          label="Delete my account"
          disabled={!sure}
          onPress={() => {
            api.account.requestDeletion(keepPosts)
            resetTo('/welcome')
          }}
        />
      }
    >
      <Text variant="title">Delete your account</Text>
      <Text variant="body">
        Your private details, chats and sessions are removed after {CONFIG.deletionHoldDays} days. If you sign in again before then, the deletion is cancelled.
      </Text>
      <Banner tone="sun" icon="clock" title="Active plan">
        Deleting your account doesn’t refund the rest of a plan.
      </Banner>
      <Check checked={keepPosts} label="Keep my community posts, without my pen name" onPress={() => setKeepPosts((v) => !v)} />
      <Check testID="delete-sure" checked={sure} label="I understand this can’t be undone after the holding period" onPress={() => setSure((v) => !v)} />
    </Screen>
  )
}
