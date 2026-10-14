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
import { rpc, usePosting } from '../supply/api'
import { canPost, canRecordPayments } from '../supply/permissions'
import { useRefreshClientMoney } from './api'

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
  if (!r) return <EmptyState title="Payment not found">It does not exist, or it is for a project you cannot see.</EmptyState>
  const project = r.projects
  const reversal = r.client_receipt_reversals

  return (
    <>
      <PageHeader
        title={`Client payment ${r.number}`}
        crumbs={project ? [{ to: '/projects', label: 'Projects' }, { to: `/projects/${project.id}?tab=client`, label: project.name }] : []}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Received{project?.client_name ? ` from ${project.client_name}` : ' from the client'}
            {r.status === 'reversed' && <Badge tone="bad">Reversed</Badge>}
          </span>
        }
      />
      {photoFailed > 0 && (
        <div className="mb-4"><Notice>The payment is saved, but {photoFailed === 1 ? 'a photo' : `${photoFailed} photos`} did not upload. {photoFailed === 1 ? 'It is' : 'They are'} kept on this phone; upload {photoFailed === 1 ? 'it' : 'them'} again below.</Notice></div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Payment">
          <div className="mb-2 text-lg font-semibold text-ink tabular-nums">{formatNPR(r.amount_paisa)}</div>
          <Detail label="Received on"><DateText value={r.receipt_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label="Project">
            {project && <Link className="text-brand" to={`/projects/${project.id}?tab=client`}>{project.code} · {project.name}</Link>}
          </Detail>
          <Detail label="For">{CLIENT_RECEIPT_KINDS[r.kind]}</Detail>
          <Detail label="How">{PAYMENT_METHODS[r.method]}</Detail>
          <Detail label="Reference">{r.reference}</Detail>
          <Detail label="Recorded by">{memberName(members.data, r.created_by)}</Detail>
          <Detail label="Notes">{r.notes}</Detail>
          {reversal && (
            <Detail label="Reversed on"><DateText value={reversal.reversal_date} display={auth.dateDisplay} /> · {reversal.reason}</Detail>
          )}
        </Card>
        <Card title="Cheque or voucher">
          <Attachments owner={{ client_receipt_id: r.id }} canAdd={r.status === 'posted' && canRecordPayments(auth)}
            label="Add cheque or voucher photo" />
          <p className="mt-3 text-sm text-subtle">
            This counts toward what the client has paid on the contract. It does not change your costs or what you owe anyone.
          </p>
        </Card>
      </div>
      {r.status === 'posted' && canPost(auth) && (
        <div className="mt-6">
          <ReasonButton variant="danger" title="Reverse this payment" hint="e.g. The cheque bounced, or the amount was typed wrong."
            confirmLabel="Reverse payment" busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: 'Reversal date' }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            Reverse payment
          </ReasonButton>
        </div>
      )}
    </>
  )
}
