// One refund (Overpayment cleared) or peski returned: from whom, how much, which project's money it came out of, and
// reversal (req §12.2, §20). A reversal is dated on its own date (§19.1).
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { ReasonButton } from '../../components/ReasonButton'
import { Badge, Card, Detail, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { PARTY, PARTY_KINDS } from '../parties/kinds'
import { memberName, useMembers, useProjects } from '../projects/api'
import { useRefreshMoney } from '../../data/refresh'
import { rpc, usePosting } from '../../data/rpc'
import { canPost } from '../../data/permissions'
import { t } from '../../lib/i18n'

export function RefundDetailPage() {
  const { refundId = '' } = useParams()
  const auth = useCompany()
  const projects = useProjects(auth.companyId)
  const members = useMembers(auth.companyId)
  const refresh = useRefreshMoney()
  const refund = useQuery({
    queryKey: ['payment', 'refund', refundId],
    queryFn: async () => {
      const { data, error } = await supabase.from('refunds')
        .select('*, suppliers(name), subcontractors(name), crews(name), payees(name), reversals(reversal_date, reason)')
        .eq('id', refundId).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const reverse = usePosting(
    (key, a: { reason: string; date: string }) => rpc('reverse_refund', { p_op_key: key, p_refund: refundId, p_date: a.date, p_reason: a.reason }),
    { onSuccess: () => refresh() },
  )

  if (refund.isPending) return <Spinner />
  if (refund.error) return <ErrorBanner onRetry={() => void refund.refetch()}>{friendlyError(refund.error)}</ErrorBanner>
  const f = refund.data
  if (!f) return <EmptyState title={t('refundDetail.refundNotFound')}>{t('refundDetail.itDoesNotExist')}</EmptyState>

  const kind = PARTY_KINDS.find((k) => f[PARTY[k].column])!
  const party = f.suppliers ?? f.subcontractors ?? f.crews ?? f.payees
  const project = f.project_id ? projects.data?.find((p) => p.id === f.project_id) : null
  const reversal = f.reversals[0]

  const what = f.kind === 'peski_returned' ? t('refundDetail.peskiReturned') : t('refundDetail.refund')
  const held = f.kind === 'peski_returned' ? t('refundDetail.held.peski') : t('refundDetail.held.overpaid')
  return (
    <>
      <PageHeader
        title={`${what} ${f.number}`}
        crumbs={[{ to: PARTY[kind].path, label: PARTY[kind].many }, { to: `${PARTY[kind].path}/${f.party_id}`, label: party?.name ?? PARTY[kind].one }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {t('refundDetail.moneyReceivedBackFrom')}{' '}<Link className="text-brand" to={`${PARTY[kind].path}/${f.party_id}`}>{party?.name}</Link>
            {f.status === 'reversed' && <Badge tone="bad">{t('refundDetail.reversed')}</Badge>}
          </span>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={what}>
          <div className="mb-2 text-lg font-semibold text-ink tabular-nums">{formatNPR(f.amount_paisa)}</div>
          <Detail label={t('refundDetail.receivedOn')}><DateText value={f.refund_date} display={auth.dateDisplay} dual /></Detail>
          <Detail label={t('refundDetail.fromTheMoneyOn')}>
            {project ? <Link className="text-brand" to={`/projects/${project.id}`}>{project.code} · {project.name}</Link> : t('refundDetail.notForAProject')}
          </Detail>
          <Detail label={t('refundDetail.how')}>{PAYMENT_METHODS[f.method]}</Detail>
          <Detail label={t('refundDetail.reference')}>{f.reference}</Detail>
          <Detail label={t('refundDetail.recordedBy')}>{memberName(members.data, f.created_by)}</Detail>
          <Detail label={t('refundDetail.notes')}>{f.notes}</Detail>
          {reversal && (
            <Detail label={t('refundDetail.reversedOn')}><DateText value={reversal.reversal_date} display={auth.dateDisplay} /> · {reversal.reason}</Detail>
          )}
        </Card>
        <Card title={t('refundDetail.whatItChanges')}>
          <p className="text-sm text-subtle">
            {t('refundDetail.changes', {
              held, name: party?.name, amount: formatNPR(f.amount_paisa),
              where: project ? t('refundDetail.onProject', { code: project.code }) : t('refundDetail.notForProject'),
            })}</p>
        </Card>
      </div>
      {f.status === 'posted' && canPost(auth) && (
        <div className="mt-6">
          <ReasonButton variant="danger" title={t('refundDetail.reverseThisRefund')} hint={t('refundDetail.eg.reverse', { held })}
            confirmLabel={t('refundDetail.reverseRefund')} busy={reverse.isPending} error={reverse.error && friendlyError(reverse.error)}
            withDate={{ value: todayKathmandu(), display: auth.dateDisplay, label: t('refundDetail.reversalDate') }}
            onConfirm={(reason, date) => reverse.mutate({ reason, date })}>
            {t('refundDetail.reverseRefund')}</ReasonButton>
        </div>
      )}
    </>
  )
}
