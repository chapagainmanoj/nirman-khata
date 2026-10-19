// Every photo still waiting on this phone, in one place (second review, Codex findings 3 and 4).
// A queued photo is otherwise shown only on its record, and some records drop out of reach:
// a progress update has no page, and site staff stop seeing a bill once it goes to Accounts.
import { Link } from 'react-router'
import { QueuedPhotos, type AttachmentOwner } from '../../components/Attachments'
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui'
import { t, type MessageKey } from '../../lib/i18n'
import { useQueuedOwners } from './PhotosWaitingNotice'

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
