// One payment from the client: how much, for what, the cheque photo, and reversal (Admin and
// Accounts, with a reason, dated on its own date) for a cheque that bounced or a typing mistake.
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateText } from '../../components/DateInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Card, Detail, EmptyState, ErrorBanner, Notice, PageHeader, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { CLIENT_RECEIPT_KINDS, PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { memberName, useMembers } from '../projects/api'
import { rpc, usePosting } from '../../data/rpc'
import { canPost, canRecordPayments } from '../../data/permissions'
import { useRefreshClientMoney } from './api'
import { t } from '../../lib/i18n'

export function ClientReceiptDetailPage() {
  const { receiptId = '' } = useParams()
  const auth = useCompany()
  const members = useMembers(auth.companyId)
  const refresh = useRefreshClientMoney()
  const photoFailed = (useLocation().state as { photoFailed?: number } | null)?.photoFailed ?? 0
  const receipt = useQuery({
    queryKey: ['client-receipt', receiptId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_receipts')
        .select('*, projects(id, code, name, client_name), client_receipt_reversals(reversal_date, reason)')
        .eq('id', receiptId).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) =>
      rpc('reverse_client_receipt', { p_op_key: key, p_receipt: receiptId, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )

  if (receipt.isPending) return <Spinner />
  if (receipt.error) return <ErrorBanner onRetry={() => void receipt.refetch()}>{friendlyError(receipt.error)}</ErrorBanner>
  const r = receipt.data
  if (!r) return <EmptyState title={t('clientReceiptDetail.paymentNotFound')}>{t('clientReceiptDetail.itDoesNotExist')}</EmptyState>
  const project = r.projects
  const reversal = r.client_receipt_reversals

  return (
    <>
      <PageHeader
        title={t('clientReceiptDetail.clientPaymentNumber', { number: r.number })}
        crumbs={project ? [{ to: '/projects', label: t('clientReceiptDetail.projects') }, { to: `/projects/${project.id}?tab=client`, label: project.name }] : []}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {project?.client_name ? t('clientReceiptDetail.receivedFrom', { name: project.client_name }) : t('clientReceiptDetail.receivedFromClient')}
            {r.status === 'reversed' && <Badge tone="bad">{t('clientReceiptDetail.reversed')}</Badge>}
          </span>
        }
      />
      {photoFailed > 0 && (
        <div className="mb-4"><Notice>{t('clientReceiptDetail.thePaymentIsSaved')}{' '}{photoFailed === 1 ? 'a photo' : t('clientReceiptDetail.photofailedPhotos', { photoFailed })} {t('clientReceiptDetail.didNotUpload')}{' '}{photoFailed === 1 ? t('clientReceiptDetail.itIs') : t('clientReceiptDetail.theyAre')} {t('clientReceiptDetail.keptOnThisPhone')}{' '}{photoFailed === 1 ? 'it' : 'them'} {t('clientReceiptDetail.againBelow')}</Notice></div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t('clientReceiptDetail.payment')}>
          <div className="mb-2 text-lg font-semibold text-ink tabular-nums">{formatNPR(r.amount_paisa)}</div>
          <Detail label={t('clientReceiptDetail.receivedOn')}><DateText value={r.receipt_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label={t('clientReceiptDetail.project')}>
            {project && <Link className="text-brand" to={`/projects/${project.id}?tab=client`}>{project.code} · {project.name}</Link>}
          </Detail>
          <Detail label={t('clientReceiptDetail.for')}>{CLIENT_RECEIPT_KINDS[r.kind]}</Detail>
          <Detail label={t('clientReceiptDetail.how')}>{PAYMENT_METHODS[r.method]}</Detail>
          <Detail label={t('clientReceiptDetail.reference')}>{r.reference}</Detail>
          <Detail label={t('clientReceiptDetail.recordedBy')}>{memberName(members.data, r.created_by)}</Detail>
          <Detail label={t('clientReceiptDetail.notes')}>{r.notes}</Detail>
          {reversal && (
            <Detail label={t('clientReceiptDetail.reversedOn')}><DateText value={reversal.reversal_date} display={auth.dateDisplay} /> · {reversal.reason}</Detail>
          )}
        </Card>
        <Card title={t('clientReceiptDetail.chequeOrVoucher')}>
          <Attachments owner={{ client_receipt_id: r.id }} canAdd={r.status === 'posted' && canRecordPayments(auth)}
            label={t('clientReceiptDetail.addChequeOrVoucher')} />
          <p className="mt-3 text-sm text-subtle">
            {t('clientReceiptDetail.thisCountsTowardWhat')}</p>
        </Card>
      </div>
      {r.status === 'posted' && canPost(auth) && (
        <div className="mt-6">
          <ReasonButton variant="danger" title={t('clientReceiptDetail.reverseThisPayment')} hint={t('clientReceiptDetail.eg.theChequeBounced')}
            confirmLabel={t('clientReceiptDetail.reversePayment')} busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('clientReceiptDetail.reversalDate') }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            {t('clientReceiptDetail.reversePayment')}</ReasonButton>
        </div>
      )}
    </>
  )
}
