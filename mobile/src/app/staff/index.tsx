import { Redirect } from 'expo-router'
import { useDb } from '@/store/db'

export default function AdminIndex() {
  const signedIn = useDb((s) => s.admin?.signedIn ?? false)
  return <Redirect href={(signedIn ? '/staff/overview' : '/staff/sign-in') as never} />
}
