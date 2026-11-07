import { Redirect } from 'expo-router'

/** The staff dashboard used to live at /admin. Old links and bookmarks go to /staff. */
export default function OldAdminAddress() {
  return <Redirect href={'/staff' as never} />
}
