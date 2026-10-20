import { Redirect } from 'expo-router'
import { useDb } from '@/store/db'
import { useFront } from '@/store/useFront'

export default function Index() {
  const signedIn = useDb((s) => s.signedIn)
  const front = useFront()
  return <Redirect href={signedIn ? '/home' : front} />
}
