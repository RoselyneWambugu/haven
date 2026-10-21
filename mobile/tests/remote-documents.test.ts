import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { setClient } from '../src/backend/client'
import { checkFile, loadMyDocuments, loadStaffDocuments, staffDocumentUrl, uploadDocument, type PickedFile } from '../src/backend/remoteDocuments'

const PDF: PickedFile = { name: 'licence.pdf', size: 120_000, mime: 'application/pdf', uri: 'file:///x.pdf', file: new Blob(['%PDF']) }

function fake(opts: { uploadError?: boolean; replies?: Record<string, unknown>; user?: string | null } = {}) {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const uploads: { path: string; type?: string }[] = []
  setClient({
    auth: { getUser: async () => ({ data: { user: opts.user === null ? null : { id: opts.user ?? 'u-1' } } }) },
    storage: {
      from: () => ({
        upload: async (path: string, _b: unknown, o: { contentType?: string }) => (uploads.push({ path, type: o.contentType }), { error: opts.uploadError ? { message: 'x' } : null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/doc' }, error: null }),
      }),
    },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: opts.replies && name in opts.replies ? opts.replies[name] : { ok: true }, error: null }
    },
  } as unknown as SupabaseClient)
  return { calls, uploads }
}
afterEach(() => setClient(null))

describe('checking a file', () => {
  it('accepts a PDF, JPEG or PNG up to 5 MB and refuses the rest', () => {
    expect(checkFile({ size: 1000, mime: 'application/pdf' })).toBeNull()
    expect(checkFile({ size: 1000, mime: 'image/png' })).toBeNull()
    expect(checkFile({ size: 1000, mime: 'image/gif' })).toMatch(/PDF, JPEG or PNG/)
    expect(checkFile({ size: 6 * 1024 * 1024, mime: 'application/pdf' })).toMatch(/5 MB/)
    expect(checkFile({ size: 0, mime: 'application/pdf' })).toMatch(/empty/)
  })
})

describe('uploading', () => {
  it('puts the file in the person’s own folder, then tells the server', async () => {
    const f = fake()
    const r = await uploadDocument('licence', PDF)
    expect(r.ok).toBe(true)
    expect(f.uploads[0].path).toMatch(/^u-1\/licence-[a-z0-9]+-[a-z0-9]+\.pdf$/)
    expect(f.uploads[0].type).toBe('application/pdf')
    expect(f.calls[0]).toMatchObject({ name: 'register_document', args: { p_kind: 'licence', p_name: 'licence.pdf', p_size: 120_000 } })
    expect(String(f.calls[0].args?.p_path)).toBe(f.uploads[0].path)
  })

  it('does not upload a file that fails the check', async () => {
    const f = fake()
    const r = await uploadDocument('id', { ...PDF, mime: 'text/plain' })
    expect(r.ok).toBe(false)
    expect(f.uploads).toHaveLength(0)
  })

  it('says so when the upload fails, and does not register it', async () => {
    const f = fake({ uploadError: true })
    expect((await uploadDocument('licence', PDF)).ok).toBe(false)
    expect(f.calls).toHaveLength(0)
  })

  it('shows the server’s reason when it refuses the file', async () => {
    fake({ replies: { register_document: { ok: false, code: 'limit', error: 'You have sent the most files allowed.' } } })
    const r = await uploadDocument('licence', PDF)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('limit')
  })
})

describe('reading', () => {
  it('lists a person’s files, or null when offline', async () => {
    fake({ replies: { my_documents: { ok: true, documents: [{ id: 'd1', kind: 'licence', name: 'a.pdf', size: 1, at: 1 }] } } })
    expect(await loadMyDocuments()).toHaveLength(1)
    fake({ replies: { my_documents: null } })
    expect(await loadMyDocuments()).toBeNull()
  })

  it('asks for an application’s or a therapist’s files', async () => {
    const f = fake({ replies: { admin_documents: { ok: true, documents: [] } } })
    await loadStaffDocuments({ application: 'a1' })
    await loadStaffDocuments({ therapist: 't1' })
    expect(f.calls.map((c) => c.args)).toEqual([{ p_application: 'a1', p_therapist: null }, { p_application: null, p_therapist: 't1' }])
  })

  it('logs the opening on the server, then makes a link', async () => {
    const f = fake({ replies: { admin_open_document: { ok: true, path: 'u-1/licence-x.pdf', name: 'a.pdf' } } })
    const r = await staffDocumentUrl('d1')
    expect(r.ok && r.value.url).toBe('https://signed.example/doc')
    expect(f.calls[0].name).toBe('admin_open_document')
  })

  it('makes no link when the server refuses', async () => {
    fake({ replies: { admin_open_document: { ok: false, code: 'role', error: 'Only clinical reviewers and Admins open these files.' } } })
    expect((await staffDocumentUrl('d1')).ok).toBe(false)
  })
})
