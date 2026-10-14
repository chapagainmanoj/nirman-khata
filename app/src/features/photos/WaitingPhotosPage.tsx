// Every photo still waiting on this phone, in one place (second review, Codex findings 3 and 4).
// A queued photo is otherwise shown only on its record, and some records drop out of reach:
// a progress update has no page, and site staff stop seeing a bill once it goes to Accounts.
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { listQueuedOwners, photoQueueKey, QueuedPhotos, type AttachmentOwner } from '../../components/Attachments'
import { Card, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui'

const RECORD: Record<string, { label: string; path?: (id: string) => string }> = {
  bill_id: { label: 'Bill', path: (id) => `/bills/${id}` },
  delivery_id: { label: 'Delivery' },
  payment_id: { label: 'Payment', path: (id) => `/payments/${id}` },
  client_receipt_id: { label: 'Client payment', path: (id) => `/receipts/${id}` },
  daily_report_id: { label: 'Daily report', path: (id) => `/daily/${id}` },
  progress_update_id: { label: 'Progress update' },
  work_package_id: { label: 'Work package', path: (id) => `/work/${id}` },
  charge_id: { label: 'Work claim' },
  labour_cost_id: { label: 'Labour cost' },
  expense_id: { label: 'Expense' },
}

function useQueuedOwners() {
  const auth = useCompany()
  const ids = { userId: auth.userId, companyId: auth.companyId }
  return useQuery({ queryKey: photoQueueKey(ids), queryFn: () => listQueuedOwners(ids) })
}

export function WaitingPhotosPage() {
  const queued = useQueuedOwners()
  return (
    <>
      <PageHeader title="Photos waiting" subtitle="Photos that did not upload. They are kept on this phone until they do." />
      {queued.isPending ? <Spinner /> : !queued.data?.length ? (
        <EmptyState title="Nothing waiting">Every photo taken on this phone has uploaded.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {queued.data.map(({ owner }) => <OwnerCard key={Object.values(owner)[0]} owner={owner} />)}
        </div>
      )}
    </>
  )
}

function OwnerCard({ owner }: { owner: AttachmentOwner }) {
  const [column, id] = Object.entries(owner)[0]
  const record = RECORD[column] ?? { label: 'Record' }
  return (
    <Card title={record.label}>
      {record.path && <Link className="mb-2 block text-sm text-slate" to={record.path(id)}>Open the {record.label.toLowerCase()}</Link>}
      <QueuedPhotos owner={owner} />
    </Card>
  )
}

/** Shown above every page while photos are waiting, so none is forgotten on the phone. */
export function PhotosWaitingNotice() {
  const queued = useQueuedOwners()
  const { pathname } = useLocation()
  const { refetch } = queued
  // Forms add to the queue without telling this list; look again on every page change.
  useEffect(() => { void refetch() }, [pathname, refetch])
  const n = queued.data?.reduce((sum, q) => sum + q.count, 0) ?? 0
  if (!n || pathname === '/photos-waiting') return null
  return (
    <div className="mb-4">
      <Notice>
        {n === 1 ? 'A photo has' : `${n} photos have`} not uploaded yet. <Link className="font-semibold text-slate" to="/photos-waiting">See {n === 1 ? 'it' : 'them'}</Link>
      </Notice>
    </div>
  )
}
