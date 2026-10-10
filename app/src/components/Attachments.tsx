// Photos on a record: challan, bill, payment proof (design §3.7). Files are immutable and
// read through 5-minute signed URLs; who may see or add them follows the owning record.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useCompany } from '../auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { newId } from '../lib/ids'
import { compressImage } from '../lib/images'
import { supabase } from '../lib/supabase'
import { platform } from '../platform'
import { Button, ConfirmButton, ErrorBanner, Status } from './ui'
import { CameraIcon, TrashIcon } from './icons'

// keyof on a union of single-key objects is `never`, so the owner column is named explicitly.
type OwnerColumn =
  | 'delivery_id' | 'bill_id' | 'payment_id' | 'work_package_id' | 'charge_id' | 'labour_cost_id' | 'expense_id'
  | 'daily_report_id' | 'progress_update_id'
export type AttachmentOwner = { [K in OwnerColumn]: { [P in K]: string } }[OwnerColumn]

const BUCKET = 'attachments'

// Screen readers hear "Challan photo 1 of 2", not "IMG_20261010_143022.jpg".
const WHAT: Record<OwnerColumn, string> = {
  delivery_id: 'Challan', bill_id: 'Bill', payment_id: 'Payment proof', work_package_id: 'Agreement',
  charge_id: 'Claim', labour_cost_id: 'Labour', expense_id: 'Receipt', daily_report_id: 'Site', progress_update_id: 'Progress',
}

/** A photo picked before its record exists. Blobs survive in the device draft (IndexedDB). */
export type PendingPhoto = { id: string; name: string; blob: Blob }

export async function uploadAttachment(companyId: string, owner: AttachmentOwner, photo: { name: string; blob: Blob }) {
  const id = newId()
  const { error } = await supabase.from('attachments').insert({
    id, company_id: companyId, ...owner, kind: 'photo',
    file_name: photo.name, content_type: photo.blob.type || 'image/jpeg', size_bytes: photo.blob.size,
  })
  if (error) throw error
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(`${companyId}/${id}`, photo.blob, { upsert: false, contentType: photo.blob.type || 'image/jpeg' })
  if (upload.error) throw upload.error
  const marked = await supabase.rpc('mark_attachment_uploaded', { p_attachment: id })
  if (marked.error) throw marked.error
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
  const urls = useMemo(() => Object.fromEntries(value.map((p) => [p.id, URL.createObjectURL(p.blob)])), [value])
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls])

  async function pick() {
    const file = await platform.pickPhoto()
    if (!file) return
    setBusy(true)
    try {
      const blob = await compressImage(file)
      onChange([...value, { id: newId(), name: file.name, blob }])
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
              {urls[p.id] && <img src={urls[p.id]} alt={`${what} ${i + 1} of ${value.length}`} className={large ? IMG_LARGE : IMG_SMALL} />}
              <Button type="button" variant="ghost" aria-label={`Remove ${what.toLowerCase()} ${i + 1}`}
                onClick={() => onChange(value.filter((x) => x.id !== p.id))}><TrashIcon size={16} />Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <div><Button type="button" variant="secondary" busy={busy} onClick={() => void pick()}>{!busy && <CameraIcon size={18} />}{value.length ? 'Add another photo' : label}</Button></div>
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
      const { data: urls, error: urlError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(data.map((a) => `${auth.companyId}/${a.id}`), 300)
      if (urlError) throw urlError
      return data.map((a, i) => ({ ...a, url: urls[i]?.signedUrl ?? null }))
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
    mutationFn: async (id: string) => {
      // On drafts the file itself is deleted; otherwise the row is only hidden (kept for audit).
      await supabase.storage.from(BUCKET).remove([`${auth.companyId}/${id}`])
      const { error } = await supabase.rpc('remove_attachment', { p_attachment: id })
      if (error) throw error
    },
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
                  {f.content_type?.startsWith('image/') ? (
                    <img src={f.url} alt={name} className={large ? IMG_LARGE : IMG_SMALL} />
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
