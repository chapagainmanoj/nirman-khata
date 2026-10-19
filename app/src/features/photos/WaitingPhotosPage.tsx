// Every photo still waiting on this phone, in one place (second review, Codex findings 3 and 4).
// A queued photo is otherwise shown only on its record, and some records drop out of reach:
// a progress update has no page, and site staff stop seeing a bill once it goes to Accounts.
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { listQueuedOwners, photoQueueKey, QueuedPhotos, type AttachmentOwner } from '../../components/Attachments'
import { Card, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui'
import { t, type MessageKey } from '../../lib/i18n'

const RECORD: Record<string, { label: MessageKey; path?: (id: string) => string }> = {
  bill_id: { label: 'waitingPhotos.kind.bill', path: (id) => `/bills/${id}` },
  delivery_id: { label: 'waitingPhotos.kind.delivery' },
  payment_id: { label: 'waitingPhotos.kind.payment', path: (id) => `/payments/${id}` },
  client_receipt_id: { label: 'waitingPhotos.kind.clientReceipt', path: (id) => `/receipts/${id}` },
  daily_report_id: { label: 'waitingPhotos.kind.dailyReport', path: (id) => `/daily/${id}` },
  progress_update_id: { label: 'waitingPhotos.kind.progressUpdate' },
  work_package_id: { label: 'waitingPhotos.kind.workPackage', path: (id) => `/work/${id}` },
  charge_id: { label: 'waitingPhotos.kind.charge' },
  labour_cost_id: { label: 'waitingPhotos.kind.labourCost' },
  expense_id: { label: 'waitingPhotos.kind.expense' },
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
      <PageHeader title={t('waitingPhotos.photosWaiting')} subtitle={t('waitingPhotos.photosThatDidNot')} />
      {queued.isPending ? <Spinner /> : !queued.data?.length ? (
        <EmptyState title={t('waitingPhotos.nothingWaiting')}>{t('waitingPhotos.everyPhotoTakenOn')}</EmptyState>
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
  const record = RECORD[column] ?? { label: 'waitingPhotos.record' as const }
  return (
    <Card title={t(record.label)}>
      {record.path && <Link className="mb-2 block text-sm text-slate" to={record.path(id)}>{t('waitingPhotos.openTheValue', { value: t(record.label).toLowerCase() })}</Link>}
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
        {n === 1 ? t('waitingPhotos.aPhotoHas') : t('waitingPhotos.nPhotosHave', { n })} {t('waitingPhotos.notUploadedYet')}{' '}<Link className="font-semibold text-slate" to="/photos-waiting">{t('waitingPhotos.see')}{' '}{n === 1 ? 'it' : 'them'}</Link>
      </Notice>
    </div>
  )
}
