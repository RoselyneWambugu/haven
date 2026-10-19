import { Redirect } from 'expo-router'
import { useDb } from '@/store/db'

export default function Index() {
  const signedIn = useDb((s) => s.signedIn)
  return <Redirect href={signedIn ? '/home' : '/welcome'} />
}
