import { Redirect } from 'expo-router'
import { useDb } from '@/store/db'

export default function PortalIndex() {
  const signedIn = useDb((s) => s.portal?.signedIn ?? false)
  return <Redirect href={(signedIn ? '/portal/today' : '/portal/sign-in') as never} />
}
