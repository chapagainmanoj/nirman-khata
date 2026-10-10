// Full company export (req §22, design §11.3): admin only. All tables come from one call to
// export_company_data, a STABLE function, so every file is from the same snapshot (E2).
// Output: one zip with a CSV per tenant table, staff.csv (this company's members only),
// manifest.json (schema version, snapshot time, row counts, SHA-256) and attachments/.
// The zip is the response itself: storage caps uploads at 50 MB, which photos can pass.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { zipSync } from 'npm:fflate@0.8.2'
import { fileKey, readFile } from '../_shared/files.ts'
import { corsHeaders, fail } from '../_shared/http.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// The free tier gives an Edge Function about 256 MB of memory; the zip is built in memory.
const MAX_ATTACHMENT_BYTES = 150 * 1024 * 1024

type Row = Record<string, unknown>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return fail('Not signed in', 401)

  let companyId = ''
  try {
    companyId = (await req.json()).company_id ?? ''
  } catch {
    return fail('Invalid request body')
  }
  if (!/^[0-9a-f-]{36}$/.test(companyId)) return fail('Company is required')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: membership } = await admin.from('memberships').select('roles')
    .eq('company_id', companyId).eq('user_id', userData.user.id).eq('active', true).maybeSingle()
  if (!membership?.roles?.includes('admin')) return fail('Only an admin can export company data', 403)

  try {
    // Read as the caller: the database checks the admin role again.
    const { data, error } = await caller.rpc('export_company_data', { p_company: companyId })
    if (error) throw error
    const snap = toSnapshot(data as Snapshot)
    const attachmentBytes = snap.attachments.reduce((s, a) => s + Number(a.size_bytes ?? 0), 0)
    if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
      return fail('This company has too many photos to export in one file. Ask support for a full export.', 413)
    }

    const files: Record<string, Uint8Array> = {}
    const manifestFiles: Array<{ path: string; rows?: number; bytes: number; sha256: string }> = []
    const add = async (path: string, data: Uint8Array, rows?: number) => {
      files[path] = data
      manifestFiles.push({ path, rows, bytes: data.byteLength, sha256: await sha256(data) })
    }
    const enc = new TextEncoder()
    for (const [table, rows] of snap.tables) await add(`${table}.csv`, enc.encode(toCsv(rows, snap.columns.get(table)!)), rows.length)
    await add('staff.csv', enc.encode(toCsv(snap.staff, ['user_id', 'full_name', 'phone', 'email', 'roles', 'active'])), snap.staff.length)

    // Files are immutable, so the snapshot's list is exact even though they are read afterwards.
    for (const a of snap.attachments) {
      const data = await readFile(fileKey(companyId, String(a.id)))
      await add(`attachments/${a.id}-${safeName(String(a.file_name ?? 'file'))}`, data)
    }

    // The company logo, if one is set (public logos bucket).
    const logoPath = (snap.tables.get('companies') ?? [])[0]?.logo_path
    if (typeof logoPath === 'string' && logoPath) {
      const { data, error } = await admin.storage.from('logos').download(logoPath)
      if (error || !data) throw new Error('The company logo could not be read')
      await add(`branding/logo.${logoPath.split('.').pop()}`, new Uint8Array(await data.arrayBuffer()))
    }

    const manifest = {
      format: 'nirmankhata-export-1', company_id: companyId, schema_version: snap.schemaVersion,
      snapshot_at: snap.snapshotAt, files: manifestFiles,
    }
    files['manifest.json'] = enc.encode(JSON.stringify(manifest, null, 2))

    const zip = zipSync(files, { level: 6 })
    const name = `nirmankhata-export-${snap.snapshotAt.slice(0, 10)}.zip`
    return new Response(zip, { headers: {
      ...corsHeaders,
      'Access-Control-Expose-Headers': 'Content-Disposition',
      'Content-Type': 'application/octet-stream', // supabase-js returns this as a Blob
      'Content-Disposition': `attachment; filename="${name}"`,
    } })
  } catch (e) {
    console.error(e)
    return fail('The export did not finish. Try again.', 500)
  }
})

type Snapshot = {
  snapshot_at: string
  schema_version: string
  tables: Record<string, { columns: string[]; rows: Row[] }>
  staff: Row[]
}

function toSnapshot(s: Snapshot) {
  const names = Object.keys(s.tables).sort()
  const tables = new Map(names.map((n) => [n, s.tables[n].rows]))
  const columns = new Map(names.map((n) => [n, s.tables[n].columns]))
  const attachments = (tables.get('attachments') ?? []).filter((a) => a.uploaded_at !== null)
  return { snapshotAt: s.snapshot_at, schemaVersion: s.schema_version, tables, columns, staff: s.staff, attachments }
}

function toCsv(rows: Row[], columns: string[]): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  // A BOM so Excel reads Nepali text as UTF-8.
  return '﻿' + [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`
const safeName = (name: string) => name.replace(/[^\w.-]+/g, '_').slice(0, 80)

async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
