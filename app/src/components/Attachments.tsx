// Photos on a record: challan, bill, payment proof (design §3.7). Files live in Cloudflare R2,
// are immutable, and are reached only through 5-minute links from the `files` Edge Function;
// who may see or add them follows the owning record.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useCompany } from '../auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { callFunction } from '../lib/functions'
import { newId } from '../lib/ids'
import { compressImage } from '../lib/images'
import { supabase } from '../lib/supabase'
import { platform } from '../platform'
import { Button, ConfirmButton, ErrorBanner, Status } from './ui'
import { CameraIcon, TrashIcon } from './icons'

// keyof on a union of single-key objects is `never`, so the owner column is named explicitly.
type OwnerColumn =
  | 'delivery_id' | 'bill_id' | 'payment_id' | 'work_package_id' | 'charge_id' | 'labour_cost_id' | 'expense_id'
  | 'daily_report_id' | 'progress_update_id' | 'client_receipt_id'
export type AttachmentOwner = { [K in OwnerColumn]: { [P in K]: string } }[OwnerColumn]

// Screen readers hear "Challan photo 1 of 2", not "IMG_20261010_143022.jpg".
const WHAT: Record<OwnerColumn, string> = {
  delivery_id: 'Challan', bill_id: 'Bill', payment_id: 'Payment proof', work_package_id: 'Agreement',
  charge_id: 'Claim', labour_cost_id: 'Labour', expense_id: 'Receipt', daily_report_id: 'Site', progress_update_id: 'Progress', client_receipt_id: 'Cheque',
}

/** A photo picked before its record exists. Blobs survive in the device draft (IndexedDB). */
export type PendingPhoto = { id: string; name: string; blob: Blob }

export async function uploadAttachment(companyId: string, owner: AttachmentOwner, photo: { name: string; blob: Blob }) {
  const id = newId()
  // The upload link is signed for exactly this type and size; the PUT must send the same.
  const contentType = photo.blob.type || 'image/jpeg'
  const { error } = await supabase.from('attachments').insert({
    id, company_id: companyId, ...owner, kind: 'photo',
    file_name: photo.name, content_type: contentType, size_bytes: photo.blob.size,
  })
  if (error) throw error
  const { url } = await callFunction<{ url: string }>('files', { action: 'upload', attachment_id: id })
  const put = await fetch(url, { method: 'PUT', body: photo.blob, headers: { 'Content-Type': contentType } }).catch(() => null)
  if (!put?.ok) throw new Error('The photo did not upload. Check your network and try again.')
  await callFunction('files', { action: 'confirm', attachment_id: id })
}

/** Upload photos taken before saving, once the record exists. Returns how many failed. */
export async function uploadPending(companyId: string, owner: AttachmentOwner, photos: PendingPhoto[]): Promise<number> {
  let failed = 0
  for (const p of photos) {
    try {
      await uploadAttachment(companyId, owner, p)
    } catch {
      failed++
    }
  }
  return failed
}

/**
 * Take photos while filling a form (paper first: the challan or bill is in hand before any typing).
 * They are uploaded after the record saves; until then they stay with the device draft.
 */
export function PhotoPicker({ value, onChange, label = 'Take photo', what = 'Photo', large }: {
  value: PendingPhoto[]; onChange: (photos: PendingPhoto[]) => void; label?: string; what?: string; large?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const urls = useMemo(() => Object.fromEntries(value.map((p) => [p.id, URL.createObjectURL(p.blob)])), [value])
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls])

  async function pick() {
    const file = await platform.pickPhoto()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const blob = await compressImage(file)
      onChange([...value, { id: newId(), name: file.name, blob }])
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className={large ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}>
          {value.map((p, i) => (
            <li key={p.id} className="flex flex-col items-center gap-1">
              {urls[p.id] && <img src={urls[p.id]} alt={`${what} ${i + 1} of ${value.length}`} className={large ? IMG_LARGE : IMG_SMALL} decoding="async" />}
              <Button type="button" variant="ghost" aria-label={`Remove ${what.toLowerCase()} ${i + 1}`}
                onClick={() => onChange(value.filter((x) => x.id !== p.id))}><TrashIcon size={16} />Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <div><Button type="button" variant="secondary" busy={busy} onClick={() => void pick()}>{!busy && <CameraIcon size={18} />}{value.length ? 'Add another photo' : label}</Button></div>
      <ErrorBanner>{error ? friendlyError(error) : null}</ErrorBanner>
    </div>
  )
}

const IMG_SMALL = 'size-24 rounded-lg border border-line object-cover'
// Large enough to read the paper while typing it in.
const IMG_LARGE = 'max-h-[70vh] w-full rounded-lg border border-line object-contain'

export function Attachments({
  owner, canAdd, canRemove, label = 'Add photo', large,
}: { owner: AttachmentOwner; canAdd: boolean; canRemove?: boolean; label?: string; large?: boolean }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [column, ownerId] = Object.entries(owner)[0] as [OwnerColumn, string]
  const queryKey = ['attachments', column, ownerId]
  const [status, setStatus] = useState('')
  // Files this browser cannot draw (an older HEIC upload) show as a named tile that opens the file.
  const [unshowable, setUnshowable] = useState<Set<string>>(() => new Set())

  const files = useQuery({
    queryKey,
    staleTime: 4 * 60_000, // signed URLs live 5 minutes
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('id, file_name, content_type, uploaded_at')
        .eq(column, ownerId)
        .not('uploaded_at', 'is', null)
        .is('removed_at', null)
        .order('created_at')
      if (error) throw error
      if (!data.length) return []
      const { urls } = await callFunction<{ urls: Record<string, string> }>('files', {
        action: 'read', attachment_ids: data.map((a) => a.id),
      })
      return data.map((a) => ({ ...a, url: urls[a.id] ?? null }))
    },
  })

  const add = useMutation({
    mutationFn: async () => {
      const file = await platform.pickPhoto()
      if (!file) return false
      setStatus('Uploading…')
      const blob = await compressImage(file)
      await uploadAttachment(auth.companyId, owner, { name: file.name, blob })
      return true
    },
    onSuccess: (added) => {
      setStatus(added ? 'Photo added.' : '')
      return queryClient.invalidateQueries({ queryKey })
    },
    onError: () => setStatus(''),
  })

  const remove = useMutation({
    // On drafts the file itself is deleted; otherwise the row is only hidden (kept for audit).
    mutationFn: (id: string) => callFunction('files', { action: 'remove', attachment_id: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <div className="flex flex-col gap-2">
      {files.data && files.data.length > 0 && (
        <ul className={large ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}>
          {files.data.map((f, i, all) => {
            const name = `${WHAT[column]} photo ${i + 1} of ${all.length}`
            return (
            <li key={f.id} className={large ? 'flex w-full flex-col items-center gap-1' : 'flex flex-col items-center gap-1'}>
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className={large ? 'block w-full' : 'block'}>
                  {f.content_type?.startsWith('image/') && !unshowable.has(f.id) ? (
                    <img src={f.url} alt={name} className={large ? IMG_LARGE : IMG_SMALL} loading="lazy" decoding="async"
                      onError={() => setUnshowable((s) => new Set(s).add(f.id))} />
                  ) : (
                    <span className="flex size-24 items-center justify-center break-all rounded-lg border border-line p-1 text-center text-xs text-subtle">
                      {f.file_name ?? name}
                    </span>
                  )}
                </a>
              )}
              {canRemove && (
                <ConfirmButton label={`Remove ${name}`} confirmLabel="Yes, remove" onConfirm={() => remove.mutate(f.id)}>
                  Remove
                </ConfirmButton>
              )}
            </li>
            )
          })}
        </ul>
      )}
      {files.data?.length === 0 && !canAdd && <p className="text-sm text-subtle">No photos.</p>}
      {canAdd && (
        <div>
          <Button type="button" variant="secondary" busy={add.isPending} onClick={() => add.mutate()}>{!add.isPending && <CameraIcon size={18} />}{label}</Button>
        </div>
      )}
      <Status className="text-xs text-subtle">{status}</Status>
      <ErrorBanner onRetry={files.error ? () => void files.refetch() : undefined}>
        {(files.error || add.error || remove.error) && friendlyError(files.error || add.error || remove.error)}
      </ErrorBanner>
    </div>
  )
}
