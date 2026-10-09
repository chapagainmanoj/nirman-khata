// Photos on a record: challan, bill, payment proof (design §3.7). Files are immutable and
// read through 5-minute signed URLs; who may see or add them follows the owning record.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useCompany } from '../auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { newId } from '../lib/ids'
import { compressImage } from '../lib/images'
import { supabase } from '../lib/supabase'
import { platform } from '../platform'
import { Button, ConfirmButton, ErrorBanner, Status } from './ui'

export type AttachmentOwner = { delivery_id: string } | { bill_id: string } | { payment_id: string }
// keyof on the union above is `never`, so the owner column is named explicitly.
type OwnerColumn = 'delivery_id' | 'bill_id' | 'payment_id'

const BUCKET = 'attachments'

// Screen readers hear "Challan photo 1 of 2", not "IMG_20261010_143022.jpg".
const WHAT: Record<OwnerColumn, string> = { delivery_id: 'Challan', bill_id: 'Bill', payment_id: 'Payment proof' }

export function Attachments({
  owner, canAdd, canRemove, label = 'Add photo',
}: { owner: AttachmentOwner; canAdd: boolean; canRemove?: boolean; label?: string }) {
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
      const id = newId()
      const { error } = await supabase.from('attachments').insert({
        id, company_id: auth.companyId, ...owner, kind: 'photo',
        file_name: file.name, content_type: blob.type || file.type, size_bytes: blob.size,
      })
      if (error) throw error
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(`${auth.companyId}/${id}`, blob, { upsert: false, contentType: blob.type || file.type })
      if (upload.error) throw upload.error
      const marked = await supabase.rpc('mark_attachment_uploaded', { p_attachment: id })
      if (marked.error) throw marked.error
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
        <ul className="flex flex-wrap gap-2">
          {files.data.map((f, i, all) => {
            const name = `${WHAT[column]} photo ${i + 1} of ${all.length}`
            return (
            <li key={f.id} className="flex flex-col items-center gap-1">
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className="block">
                  {f.content_type?.startsWith('image/') ? (
                    <img src={f.url} alt={name} className="size-24 rounded-lg border border-line object-cover" />
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
          <Button type="button" variant="secondary" busy={add.isPending} onClick={() => add.mutate()}>{label}</Button>
        </div>
      )}
      <Status className="text-xs text-subtle">{status}</Status>
      <ErrorBanner onRetry={files.error ? () => void files.refetch() : undefined}>
        {(files.error || add.error || remove.error) && friendlyError(files.error || add.error || remove.error)}
      </ErrorBanner>
    </div>
  )
}
