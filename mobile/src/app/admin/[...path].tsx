import { Redirect, useLocalSearchParams } from 'expo-router'

/** /admin/anything goes to the same page under /staff. */
export default function OldAdminPage() {
  const { path } = useLocalSearchParams<{ path: string | string[] }>()
  const rest = Array.isArray(path) ? path.join('/') : (path ?? '')
  return <Redirect href={`/staff/${rest}` as never} />
}
