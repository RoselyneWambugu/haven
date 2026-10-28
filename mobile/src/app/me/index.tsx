import { REMOTE } from '@/backend/client'
import { View } from 'react-native'
import { api } from '@/api'
import { Avatar } from '@/components/Art'
import { Badge } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Card, Row } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { now } from '@/lib/clock'
import { ageBandLabel } from '@/lib/identity'
import { go, resetTo } from '@/lib/nav'
import { planState } from '@/lib/plan'
import { useDb } from '@/store/db'

export default function Me() {
  const account = useDb((s) => s.account)
  const sub = useDb((s) => s.subscription)
  const PLANS = useDb((s) => s.content.plans)
  if (!account) return null
  const state = planState(sub, now())
  const plan = sub ? PLANS.find((p) => p.id === sub.planId)?.label : null
  return (
    <Screen testID="me" header={<TopBar back title="Me" />}>
      <Card tone="lichen">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar kind={account.public.avatar} size={64} />
          <View style={{ flex: 1 }}>
            <Text variant="h2">{account.public.penName}</Text>
            <Text variant="small" muted>
              {ageBandLabel(account.public.ageBand)} · {account.public.languages.join(', ')}
            </Text>
          </View>
        </View>
      </Card>
      <View>
        <Row testID="me-profiles" icon="person" title="My profiles" sub="What others see, and your private details" onPress={() => go('/me/profiles')} />
        <Row testID="me-plan" icon="wallet" title="My plan" sub={state === 'none' ? 'No plan yet' : state === 'lapsed' ? `${plan}, ended` : `${plan}${state === 'ending' ? ', ending' : ''}`} onPress={() => go('/plan')} />
        <Row icon="cal" title="My sessions" onPress={() => go('/sessions')} />
        <Row icon="forum" title="My posts" onPress={() => go('/forum/mine')} />
        <Row
          testID="me-standing"
          icon="shield"
          title="Account standing"
          sub={account.standing === 'good' ? 'In good standing' : account.standing === 'restricted' ? 'Restricted' : 'Paused'}
          right={account.standing !== 'good' ? <Badge tone="sun" label="Needs attention" /> : undefined}
          onPress={() => go('/standing')}
        />
        <Row testID="me-settings" icon="tool" title="Settings" onPress={() => go('/settings')} />
        <Row icon="help" title="Help" onPress={() => go('/help')} />
        {!REMOTE ? <Row icon="rocket" title="Demo tools" sub="For reviewers" onPress={() => go('/demo')} /> : null}
        <Row icon="external" title="About Echo" onPress={() => go('/about')} />
        <Row
          testID="sign-out"
          icon="back"
          title="Sign out"
          danger
          last
          onPress={() => {
            api.auth.signOut()
            resetTo('/welcome')
          }}
        />
      </View>
    </Screen>
  )
}
