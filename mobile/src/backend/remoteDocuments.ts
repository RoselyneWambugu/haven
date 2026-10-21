import type { Res } from '@/api/types'
import { supabase } from './client'

const OFFLINE = 'We couldn’t reach Echo. Check your connection and try again.'
const BUCKET = 'applications'
export const MAX_BYTES = 5 * 1024 * 1024
export const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'] as const
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }

export type DocumentKind = 'licence' | 'id' | 'qualification' | 'renewal'
export interface DocumentRecord { id: string; kind: DocumentKind; name: string; size: number; at: number; sent?: boolean }
export interface PickedFile { name: string; size: number; mime: string; uri: string; file?: Blob }
type Reply = { ok: boolean; error?: string; code?: string }

async function call<T extends Reply = Reply>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args)
  if (error || !data) return { ok: false, error: OFFLINE } as T
  return data as T
}

/** Checks a file before it leaves the device: a PDF, JPEG or PNG up to 5 MB. */
export function checkFile(f: Pick<PickedFile, 'size' | 'mime'>): string | null {
  if (!(ALLOWED as readonly string[]).includes(f.mime)) return 'Choose a PDF, JPEG or PNG file.'
  if (f.size <= 0) return 'That file is empty.'
  if (f.size > MAX_BYTES) return 'Files can be up to 5 MB.'
  return null
}

/** Uploads the file to the person's own folder, then tells the server about it. The server checks both. */
export async function uploadDocument(kind: DocumentKind, f: PickedFile): Promise<Res> {
  const bad = checkFile(f)
  if (bad) return { ok: false, error: bad, code: 'file' }
  const { data: u } = await supabase().auth.getUser()
  const uid = u?.user?.id
  if (!uid) return { ok: false, error: 'Sign in first.' }
  const path = `${uid}/${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${EXT[f.mime]}`
  let body: Blob | ArrayBuffer
  try {
    body = f.file ?? (await (await fetch(f.uri)).arrayBuffer())
  } catch {
    return { ok: false, error: 'We couldn’t read that file. Try choosing it again.' }
  }
  const up = await supabase().storage.from(BUCKET).upload(path, body, { contentType: f.mime, upsert: false })
  if (up.error) return { ok: false, error: OFFLINE }
  const r = await call('register_document', { p_kind: kind, p_path: path, p_name: f.name, p_size: f.size })
  return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error ?? OFFLINE, code: r.code }
}

/** The signed-in person's own files. Null when the server can't be reached. */
export async function loadMyDocuments(): Promise<DocumentRecord[] | null> {
  const d = await call<Reply & { documents?: DocumentRecord[] }>('my_documents')
  return d.ok && d.documents ? d.documents : null
}

/** Staff: the files for an application, or a therapist's renewals. */
export async function loadStaffDocuments(owner: { application?: string; therapist?: string }): Promise<DocumentRecord[] | null> {
  const d = await call<Reply & { documents?: DocumentRecord[] }>('admin_documents', { p_application: owner.application ?? null, p_therapist: owner.therapist ?? null })
  return d.ok && d.documents ? d.documents : null
}

/** Staff: opening a file is logged, then a link that works for one minute is made. The screen opens it. */
export async function staffDocumentUrl(id: string): Promise<Res<{ url: string }>> {
  const r = await call<Reply & { path?: string }>('admin_open_document', { p_id: id })
  if (!r.ok || !r.path) return { ok: false, error: r.error ?? OFFLINE, code: r.code }
  const s = await supabase().storage.from(BUCKET).createSignedUrl(r.path, 60)
  if (s.error || !s.data?.signedUrl) return { ok: false, error: OFFLINE }
  return { ok: true, value: { url: s.data.signedUrl } }
}
