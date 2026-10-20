import { Tabs } from 'expo-router'
import { TabBar } from '@/components/Layout'

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="forum" />
      <Tabs.Screen name="therapists" />
      <Tabs.Screen name="help" />
    </Tabs>
  )
}
