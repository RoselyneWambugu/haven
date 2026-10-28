import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button } from '@/components/Button'
import { Banner } from '@/components/Surfaces'
import { Text } from '@/components/Text'
import { loadMyDocuments, uploadDocument, type DocumentKind, type DocumentRecord } from '@/backend/remoteDocuments'
import { pickFile } from '@/lib/pickFile'
import { dayLong } from '@/lib/time'

const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** One kind of document: what has been sent, and a way to send another. PDF, JPEG or PNG up to 5 MB. */
export function DocumentUpload({ kind, label, hint, onChange }: { kind: DocumentKind; label: string; hint?: string; onChange?: (docs: DocumentRecord[]) => void }) {
  const [docs, setDocs] = useState<DocumentRecord[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await loadMyDocuments()
    if (d) {
      setDocs(d)
      onChange?.(d)
    }
  }, [onChange])
  useEffect(() => {
    void load()
  }, [load])

  async function choose() {
    setError(null)
    const f = await pickFile()
    if (!f) return
    setBusy(true)
    const r = await uploadDocument(kind, f)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    await load()
  }

  const mine = (docs ?? []).filter((d) => d.kind === kind)
  return (
    <View testID={`doc-${kind}`} style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      {hint ? <Text variant="caption" muted>{hint}</Text> : null}
      {mine.map((d) => (
        <Text key={d.id} variant="small" muted>
          {d.name} · {kb(d.size)} · sent {dayLong(d.at)}
        </Text>
      ))}
      {error ? <Banner tone="clay">{error}</Banner> : null}
      <View style={{ flexDirection: 'row' }}>
        <Button testID={`doc-choose-${kind}`} size="sm" variant="quiet" label={mine.length ? 'Send another file' : 'Choose a file'} disabled={busy} onPress={choose} />
      </View>
    </View>
  )
}
