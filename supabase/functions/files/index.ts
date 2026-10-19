// Attachment files (design §3.7): upload, confirm, read and remove links for the R2 bucket.
// Every permission check is the database's, made as the signed-in user; this function only
// turns an allowed action into a 5-minute presigned URL, or deletes or checks an object.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { corsHeaders, fail, json } from '../_shared/http.ts'
import { copyIfUnchanged, deleteFile, fileKey, readUrl, stagingKey, stored, uploadUrl } from '../_shared/files.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_READ = 50

type Body = { action?: string; attachment_id?: string; attachment_ids?: string[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  const user = userData.user
  if (!user) return fail('Not signed in', 401, 'not_signed_in')

  let body: Body
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request body', 400, 'invalid_request')
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    if (body.action === 'read') {
      const ids = (body.attachment_ids ?? []).filter((id) => UUID.test(id)).slice(0, MAX_READ)
      if (!ids.length) return json({ urls: {} })
      // Row security returns only the files this user may see.
      const { data, error } = await caller.from('attachments').select('id, company_id')
        .in('id', ids).not('uploaded_at', 'is', null).is('removed_at', null)
      if (error) throw error
      const urls: Record<string, string> = {}
      for (const a of data) urls[a.id] = await readUrl(fileKey(a.company_id, a.id))
      return json({ urls })
    }

    const id = body.attachment_id ?? ''
    if (!UUID.test(id)) return fail('Attachment is required')

    if (body.action === 'upload') {
      const { data, error } = await caller.rpc('attachment_upload_target', { p_attachment: id }).single()
      if (error) return fail(error.message, error.code === '42501' ? 403 : 400)
      const t = data as { company_id: string; content_type: string; size_bytes: number }
      return json({ url: await uploadUrl(stagingKey(t.company_id, id), t.content_type, Number(t.size_bytes)) })
    }

    if (body.action === 'confirm') {
      const { data: a } = await admin.from('attachments').select('company_id, created_by, uploaded_at').eq('id', id).maybeSingle()
      if (!a) return fail('Attachment not found', 404)
      if (a.created_by !== user.id) return fail('Attachment not found or already uploaded', 409)
      // A retry after a lost answer: the upload already finished, so say so instead of failing.
      if (a.uploaded_at) return json({ ok: true, already: true })
      // The upload went to staging; the confirmed file is a copy of exactly what was checked.
      const staged = stagingKey(a.company_id, id)
      const file = await stored(staged)
      if (!file) return fail('The file did not arrive. Try again.', 409)
      if (!(await copyIfUnchanged(staged, fileKey(a.company_id, id), file.etag))) {
        return fail('The file changed while it was being checked. Try again.', 409)
      }
      const { error } = await admin.rpc('mark_attachment_uploaded', { p_attachment: id, p_user: user.id, p_size: file.size })
      if (error) return fail(error.code === 'P0002' ? 'Attachment not found or already uploaded' : error.message, 409)
      await deleteFile(staged)
      return json({ ok: true })
    }

    if (body.action === 'remove') {
      const { data: a } = await admin.from('attachments').select('company_id').eq('id', id).maybeSingle()
      // The database decides: delete (drafts, unfinished uploads), hide, or refuse.
      const { data: deleted, error } = await caller.rpc('remove_attachment', { p_attachment: id })
      if (error) return fail(error.message, error.code === '42501' ? 403 : 400)
      if (deleted && a) {
        await deleteFile(fileKey(a.company_id, id))
        await deleteFile(stagingKey(a.company_id, id))
      }
      return json({ ok: true })
    }

    return fail('Unknown action')
  } catch (e) {
    console.error(e)
    return fail('The file service did not answer. Try again.', 502, 'service_down')
  }
})
