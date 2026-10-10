// Every payment the person can see, newest first, with who it was paid to.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { canRecordPayments } from '../supply/permissions'
import { useProjects } from '../projects/api'
import { useProjectFilter } from './ProjectFilter'

function usePayments(companyId: string, projectId: string | null) {
  return useQuery({
    queryKey: ['payments', { companyId, projectId }],
    queryFn: async () => {
      let q = supabase.from('payment_summaries')
        .select('*, suppliers(name), subcontractors(name), crews(name), payees(name)')
        .eq('company_id', companyId).order('payment_date', { ascending: false }).limit(200)
      // A payment counts for a project once some of it is assigned there.
      if (projectId) q = q.contains('project_ids', [projectId])
      const { data, error } = await q
      if (error) throw error
      return data.map((p) => ({
        ...p, id: p.id!, number: p.number!, payment_date: p.payment_date!, status: p.status!, method: p.method!,
        amount_paisa: p.amount_paisa ?? 0, allocated_paisa: p.allocated_paisa ?? 0,
        party: p.suppliers?.name ?? p.subcontractors?.name ?? p.crews?.name ?? p.payees?.name ?? '',
      }))
    },
  })
}

export function PaymentsPage() {
  const auth = useCompany()
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  const payments = usePayments(auth.companyId, projectId)
  const projects = useProjects(auth.companyId)
  const codes = (ids: string[] | null) => (ids ?? []).map((id) => projects.data?.find((p) => p.id === id)?.code).filter(Boolean).join(', ')
  return (
    <>
      <PageHeader title="Payments" subtitle="Money paid to suppliers, subcontractors, crews and payees."
        actions={canRecordPayments(auth) && <ButtonLink to={recordProject ? `/payments/new?project=${recordProject}` : '/payments/new'}>Record payment</ButtonLink>} />
      {chip}
      <Card>
        {payments.isPending && <Spinner />}
        <ErrorBanner onRetry={() => void payments.refetch()}>{payments.error && friendlyError(payments.error)}</ErrorBanner>
        {payments.data?.length === 0 && empty('payments', <EmptyState title="No payments yet" />)}
        <ul>
          {payments.data?.map((p) => (
            <li key={p.id} className="border-b border-line last:border-0">
              <Link to={`/payments/${p.id}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium break-words text-ink">{p.party || p.number}</div>
                  <div className="text-xs text-subtle">
                    {p.number} · {PAYMENT_METHODS[p.method]} · <DateText value={p.payment_date} display={auth.dateDisplay} />
                    {showProject && codes(p.project_ids) && <> · {codes(p.project_ids)}</>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
                  <span>{formatNPR(p.amount_paisa)}</span>
                  {p.status === 'reversed' && <Badge tone="bad">Reversed</Badge>}
                  {p.status === 'posted' && p.allocated_paisa < p.amount_paisa && <Badge tone="warn">Part unassigned</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
