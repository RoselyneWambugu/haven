import * as DocumentPicker from 'expo-document-picker'
import { ALLOWED, type PickedFile } from '@/backend/remoteDocuments'

/** Opens the phone's or browser's file chooser. Null when the person backs out. */
export async function pickFile(): Promise<PickedFile | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: [...ALLOWED], copyToCacheDirectory: true, multiple: false })
  if (r.canceled || !r.assets?.[0]) return null
  const a = r.assets[0]
  return { name: a.name, size: a.size ?? 0, mime: a.mimeType ?? '', uri: a.uri, file: (a as { file?: Blob }).file }
}
