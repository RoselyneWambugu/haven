import { View } from 'react-native'
import { Redirect } from 'expo-router'
import { api } from '@/api'
import { REMOTE } from '@/backend/client'
import { Button } from '@/components/Button'
import { ToggleRow } from '@/components/Controls'
import { Screen, TopBar } from '@/components/Layout'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { resetTo } from '@/lib/nav'
import { useDb } from '@/store/db'

/** Switches for reviewers. They show states that normally take days or need real staff. Not part of the product. */
export default function Demo() {
  const d = useDb((s) => s.demo)
  if (REMOTE) return <Redirect href="/" />
  const act = (fn: () => void) => () => fn()
  return (
    <Screen testID="demo" header={<TopBar back title="Demo tools" />}>
      <Text variant="title">Demo tools</Text>
      <Banner tone="sun" icon="rocket">
        Reviewers only. Everything here is simulated on this device.
      </Banner>
      <ToggleRow testID="demo-prices" label="Show sample prices" sub="Prices are an open decision, so they normally show KES ___" on={d.showPrices} onChange={(v) => api.demo.showPrices(v)} />
      <ToggleRow label="Make the next payment fail" on={d.failNextPayment} onChange={(v) => api.demo.failNextPayment(v)} />
      <Text variant="h3">Plan</Text>
      <View style={{ gap: 8 }}>
        <Button variant="quiet" label="Give me a monthly plan" onPress={act(() => api.demo.grantPlan('monthly'))} />
        <Button variant="quiet" label="End my plan now" onPress={act(() => api.demo.lapsePlan())} />
      </View>
      <Text variant="h3">Account</Text>
      <View style={{ gap: 8 }}>
        <Button variant="quiet" label="Add a warning notice" onPress={act(() => api.demo.addNotice())} />
        <Button variant="quiet" label="Show a new-device alert" onPress={act(() => api.demo.newDeviceAlert())} />
        <Button variant="quiet" label="Pause my account" onPress={act(() => api.demo.setStanding('paused'))} />
        <Button variant="quiet" label="Restore good standing" onPress={act(() => api.demo.setStanding('good'))} />
      </View>
      <Text variant="h3">Group chats</Text>
      <View style={{ gap: 8 }}>
        <Button testID="demo-start-group" variant="quiet" label="Start the next group chat now" onPress={act(() => api.demo.startNextGroupChat())} />
      </View>
      <Text variant="h3">Time</Text>
      <View style={{ gap: 8 }}>
        <Button variant="quiet" label="Move forward 10 minutes" onPress={act(() => api.demo.advanceClock(10))} />
        <Button variant="quiet" label="Move forward 1 hour" onPress={act(() => api.demo.advanceClock(60))} />
        <Button variant="quiet" label="Move forward 1 day" onPress={act(() => api.demo.advanceClock(1440))} />
      </View>
      <Button
        testID="demo-reset"
        variant="dangerGhost"
        label="Reset the demo"
        onPress={() => {
          api.demo.reset()
          resetTo('/welcome')
        }}
      />
    </Screen>
  )
}
