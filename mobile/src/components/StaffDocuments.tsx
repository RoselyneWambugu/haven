import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { Linking } from 'react-native'
import { loadStaffDocuments, staffDocumentUrl, type DocumentRecord } from '@/backend/remoteDocuments'
import { dayLong } from '@/lib/time'

const KIND = { licence: 'Licence', id: 'National ID', qualification: 'Qualification', renewal: 'Renewed certificate' } as const

/** The files an applicant or therapist sent. Opening one is recorded in the audit log. */
export function StaffDocuments({ owner, empty }: { owner: { application?: string; therapist?: string }; empty?: string }) {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void loadStaffDocuments(owner).then(setDocs)
  }, [owner.application, owner.therapist])

  if (!docs) return null
  return (
    <View style={{ gap: 6 }}>
      {docs.length === 0 ? <Text variant="small" muted>{empty ?? 'Nothing has been sent yet.'}</Text> : null}
      {docs.map((d) => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text variant="small" style={{ flex: 1, minWidth: 180 }}>
            {KIND[d.kind]} · {d.name}
          </Text>
          <Text variant="caption" muted>
            {dayLong(d.at)}
          </Text>
          <Button testID={`open-doc-${d.id}`} size="sm" variant="quiet" label="Open" onPress={async () => { const r = await staffDocumentUrl(d.id); if (r.ok) await Linking.openURL(r.value.url); setError(r.ok ? null : r.error) }} />
        </View>
      ))}
      {error ? <Banner tone="clay">{error}</Banner> : null}
    </View>
  )
}
