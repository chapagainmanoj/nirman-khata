// Attachment files live in an S3-compatible bucket: Cloudflare R2 in production, and the local
// Supabase Storage S3 endpoint in development and CI, so both run the same code (design §3.7).
// Object key: "{company_id}/{attachment_id}". Browsers only ever get 5-minute presigned URLs.
// Uploads land on "staging/{company_id}/{attachment_id}" and are copied to the final key on confirm,
// so an upload link reused within its 5 minutes can never replace a confirmed file (second review
// #7). Neither R2 nor local Storage honours If-None-Match on a presigned PUT, so this is the guard.
// An R2 lifecycle rule expires "staging/" after a day.
import { AwsClient } from 'npm:aws4fetch@1.0.20'

function setting(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const bucket = setting('FILES_BUCKET')
// This function reaches the bucket here; browsers may need a different host (local Docker).
const endpoint = setting('FILES_S3_ENDPOINT').replace(/\/$/, '')
const publicEndpoint = (Deno.env.get('FILES_S3_PUBLIC_ENDPOINT') || endpoint).replace(/\/$/, '')

const s3 = new AwsClient({
  accessKeyId: setting('FILES_S3_ACCESS_KEY_ID'),
  secretAccessKey: setting('FILES_S3_SECRET_ACCESS_KEY'),
  region: Deno.env.get('FILES_S3_REGION') || 'auto',
  service: 's3',
  retries: 2,
})

const LINK_SECONDS = 300

export const fileKey = (companyId: string, attachmentId: string) => `${companyId}/${attachmentId}`
export const stagingKey = (companyId: string, attachmentId: string) => `staging/${companyId}/${attachmentId}`
const objectUrl = (base: string, key: string) => `${base}/${bucket}/${key}`

async function presign(method: 'GET' | 'PUT', key: string, headers: Record<string, string> = {}) {
  const signed = await s3.sign(`${objectUrl(publicEndpoint, key)}?X-Amz-Expires=${LINK_SECONDS}`, {
    method,
    headers,
    // Sign content-type and content-length too, so an upload link takes only the declared file.
    aws: { signQuery: true, allHeaders: true },
  })
  return signed.url
}

export const uploadUrl = (key: string, contentType: string, size: number) =>
  presign('PUT', key, { 'content-type': contentType, 'content-length': String(size) })

export const readUrl = (key: string) => presign('GET', key)

/** Size and ETag of a stored object, or null when it is not there. */
export async function stored(key: string): Promise<{ size: number; etag: string } | null> {
  const res = await s3.fetch(objectUrl(endpoint, key), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HEAD ${key}: ${res.status}`)
  return { size: Number(res.headers.get('content-length')), etag: res.headers.get('etag') ?? '' }
}

/**
 * Copy `from` to `to` only if `from` is still the object with this ETag: an upload that replaced
 * it after it was checked is not copied. Returns false when it changed.
 */
export async function copyIfUnchanged(from: string, to: string, etag: string): Promise<boolean> {
  const res = await s3.fetch(objectUrl(endpoint, to), {
    method: 'PUT',
    headers: { 'x-amz-copy-source': `/${bucket}/${from}`, 'x-amz-copy-source-if-match': etag },
  })
  if (res.status === 412) return false
  if (!res.ok) throw new Error(`COPY ${from}: ${res.status}`)
  // S3 can answer 200 with an error in the body for a copy.
  if ((await res.text()).includes('<Error>')) throw new Error(`COPY ${from}: failed`)
  return true
}

export async function readFile(key: string): Promise<Uint8Array> {
  const res = await s3.fetch(objectUrl(endpoint, key))
  if (!res.ok) throw new Error(`GET ${key}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function deleteFile(key: string): Promise<void> {
  const res = await s3.fetch(objectUrl(endpoint, key), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${key}: ${res.status}`)
}
