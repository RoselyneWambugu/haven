import { View } from 'react-native'
import { router } from 'expo-router'
import { api } from '@/api'
import { Button } from '@/components/Button'
import { Panel } from '@/components/Portal'
import { Text } from '@/components/Text'
import { THERAPISTS } from '@/data/seed'
import { go } from '@/lib/nav'
import { useDb } from '@/store/db'

/** Therapists sign in separately from members. The demo signs in as one seeded therapist. */
export default function PortalSignIn() {
  const app = useDb((s) => s.portal?.application ?? 'none')
  const demo = THERAPISTS.find((t) => t.id === 't-amina')!
  return (
    <View testID="portal-sign-in" style={{ flex: 1, alignItems: 'center', padding: 24, paddingTop: 48 }}>
      <View style={{ width: '100%', maxWidth: 460, gap: 18 }}>
        <Text variant="display">Welcome back</Text>
        <Text variant="body" muted>
          Echo is for licensed therapists. Clients are anonymous: you see a pen name and avatar only.
        </Text>
        <Panel tone="lichen">
          <Text variant="label">Demo</Text>
          <Text variant="small">Real sign-in uses your phone and a code. For this demo, continue as a seeded therapist.</Text>
          <Button
            testID="portal-demo-sign-in"
            label={`Continue as ${demo.name}`}
            onPress={() => {
              api.portal.signIn()
              router.replace('/portal/today' as never)
            }}
          />
        </Panel>
        <Button testID="portal-apply" variant="quiet" label={app === 'none' ? 'Apply to join Echo' : 'See my application'} onPress={() => go('/portal/apply')} />
        <Button variant="ghost" label="Back to the member app" onPress={() => router.replace('/welcome' as never)} />
      </View>
    </View>
  )
}
