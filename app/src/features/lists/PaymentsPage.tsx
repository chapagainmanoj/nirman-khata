// Every payment the person can see, newest first, with who it was paid to and what for;
// searchable by number, who was paid and what for, and filtered by date and kind of party.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateText } from '../../components/DateInput'
import { Badge, ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { containsAny } from '../../lib/search'
import { ShowMore } from '../../components/ShowMore'
import { usePaged } from '../../lib/paging'
import { supabase } from '../../lib/supabase'
import { canRecordPayments } from '../supply/permissions'
import { useParties } from '../parties/api'
import { useProjects } from '../projects/api'
import { useListFilters, type ListSearch } from './ListFilters'
import { useProjectFilter } from './ProjectFilter'

type PaymentFilter = { companyId: string; projectId: string | null; paidTo: string | null; partyMatch?: string[] } & ListSearch

type Filterable<Q> = {
  eq: (c: string, v: string) => Q; contains: (c: string, v: string[]) => Q
  gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q; or: (f: string) => Q
}

// PostgREST filters shared by the list and its count.
function paymentQuery<Q extends Filterable<Q>>(q: Q, f: PaymentFilter): Q {
  q = q.eq('company_id', f.companyId)
  // A payment counts for a project once some of it is assigned there.
  if (f.projectId) q = q.contains('project_ids', [f.projectId])
  // Two `or` filters must both hold, so this and the search combine.
  const columns = PAID_TO.find(([k]) => k === f.paidTo)?.[2]
  if (columns) q = q.or(columns.map((c) => `${c}.not.is.null`).join(','))
  if (f.from) q = q.gte('payment_date', f.from)
  if (f.to) q = q.lte('payment_date', f.to)
  if (f.search) q = q.or(containsAny(f.search, ['number', 'reference', 'paid_for'], 'party_id', f.partyMatch))
  return q
}

/** Who a payment went to, by kind: crews and workers together as labour (GLOSSARY: Worker). */
const PAID_TO: Array<[key: string, label: string, columns: string[]]> = [
  ['supplier', 'Suppliers', ['supplier_id']],
  ['subcontractor', 'Subcontractors', ['subcontractor_id']],
  ['labour', 'Labour (crews and workers)', ['crew_id', 'worker_id']],
  ['payee', 'Other services', ['payee_id']],
]

/**
 * The ids of every party whose name has the term: a payment can go to any kind, so the shared
 * search's supplier match is widened to subcontractors, crews, workers and other services.
 */
function usePartyMatch(companyId: string, term: string | undefined, supplierMatch: string[] = []) {
  const lists = [useParties(companyId, 'subcontractor'), useParties(companyId, 'crew'), useParties(companyId, 'payee'), useParties(companyId, 'worker')]
  if (!term) return undefined
  const t = term.toLowerCase()
  // A new array each render is fine: query keys compare by value.
  return [...supplierMatch, ...lists.flatMap((l) => (l.data ?? []).filter((p) => p.name.toLowerCase().includes(t)).map((p) => p.id))]
}

function usePayments(filter: PaymentFilter) {
  return usePaged(['payments', filter], async (from, to) => {
    const q = paymentQuery(supabase.from('payment_summaries')
      .select('*, suppliers(name), subcontractors(name), crews(name), payees(name, is_cash), workers(name)'), filter)
    const { data, error } = await q.order('payment_date', { ascending: false }).order('number', { ascending: false }).range(from, to)
    if (error) throw error
    return data.map((p) => ({
      ...p, id: p.id!, number: p.number!, payment_date: p.payment_date!, status: p.status!, method: p.method!,
      amount_paisa: p.amount_paisa ?? 0, allocated_paisa: p.allocated_paisa ?? 0,
      // The Cash payee is "Cash (not named)"; in a table row "Cash" says it.
      party: p.suppliers?.name ?? p.subcontractors?.name ?? p.crews?.name ?? p.workers?.name
        ?? (p.payees?.is_cash ? PAYMENT_METHODS.cash : p.payees?.name) ?? '',
    }))
  })
}

/** How many payments match, for "Showing 50 of 230". */
function usePaymentCount(filter: PaymentFilter) {
  return useQuery({
    queryKey: ['payments', 'count', filter],
    queryFn: async () => {
      const { count, error } = await paymentQuery(supabase.from('payment_summaries').select('id', { count: 'exact', head: true }), filter)
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * Every payment as a compact table, newest first, 50 at a time: one line a payment on a laptop.
 * On a phone, what it was for, the number, method, date and projects move under who was paid.
 */
export function PaymentsPage() {
  const auth = useCompany()
  const { projectId, chip, empty, recordProject, showProject } = useProjectFilter()
  const search = useListFilters({
    placeholder: 'Search number, who was paid or what for',
    choice: { param: 'to', label: 'Paid to', any: 'Paid to anyone', options: PAID_TO.map(([k, label]) => [k, label]) },
  })
  const partyMatch = usePartyMatch(auth.companyId, search.filter.search, search.filter.supplierMatch)
  const { supplierMatch: _, ...dates } = search.filter
  const filter: PaymentFilter = { companyId: auth.companyId, projectId, paidTo: search.chosen, ...dates, ...(partyMatch ? { partyMatch } : {}) }
  const payments = usePayments(filter)
  const total = usePaymentCount(filter).data
  const projects = useProjects(auth.companyId)
  const codes = (ids: string[] | null) => (ids ?? []).map((id) => projects.data?.find((p) => p.id === id)?.code).filter(Boolean).join(', ')
  const th = 'py-2 pr-3 font-medium'
  return (
    <>
      <PageHeader title="Payments" subtitle="Money paid to suppliers, subcontractors, crews and other services."
        actions={canRecordPayments(auth) && <ButtonLink variant="tonal" to={recordProject ? `/payments/new?project=${recordProject}` : '/payments/new'}>Record payment</ButtonLink>} />
      {chip}
      {search.bar}
      {payments.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void payments.refetch()}>{payments.error && friendlyError(payments.error)}</ErrorBanner>
      {payments.data?.length === 0 && (search.active ? search.noMatch('payments') : <Card>{empty('payments', <EmptyState title="No payments yet" />)}</Card>)}
      {payments.data && payments.data.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-subtle">
                <th scope="col" className={`hidden pl-4 sm:table-cell ${th}`}>Date</th>
                <th scope="col" className={`hidden md:table-cell ${th}`}>Number</th>
                <th scope="col" className={`pl-4 sm:pl-0 ${th}`}>Paid to</th>
                <th scope="col" className={`hidden lg:table-cell ${th}`}>For</th>
                <th scope="col" className={`hidden md:table-cell ${th}`}>Method</th>
                {showProject && <th scope="col" className={`hidden md:table-cell ${th}`}>Project</th>}
                <th scope="col" className="py-2 pr-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.data.map((p) => {
                const to = `/payments/${p.id}`
                const badge = p.status === 'reversed' ? <Badge tone="bad">Reversed</Badge>
                  : p.status === 'posted' && p.allocated_paisa < p.amount_paisa ? <Badge tone="warn">Part unassigned</Badge> : null
                return (
                  <tr key={p.id} className={`border-b border-line align-middle last:border-0 hover:bg-muted ${p.status === 'reversed' ? 'text-subtle' : ''}`}>
                    <td className="hidden py-2 pr-3 pl-4 whitespace-nowrap text-subtle sm:table-cell"><DateText value={p.payment_date} display={auth.dateDisplay} /></td>
                    <td className="hidden py-2 pr-3 whitespace-nowrap md:table-cell"><Link to={to} className="text-slate hover:underline">{p.number}</Link></td>
                    <td className="py-2 pr-3 pl-4 sm:pl-0">
                      <Link to={to} className="inline-flex min-h-8 items-center font-medium break-words text-ink hover:underline">{p.party || p.number}</Link>
                      {/* Smaller screens: what the hidden columns say. */}
                      {p.paid_for && <div className="text-xs break-words text-ink lg:hidden">{t('payments.for', { what: p.paid_for })}</div>}
                      <div className="text-xs text-subtle md:hidden">
                        {p.number} · {PAYMENT_METHODS[p.method]}<span className="sm:hidden"> · <DateText value={p.payment_date} display={auth.dateDisplay} /></span>
                        {showProject && codes(p.project_ids) && <> · {codes(p.project_ids)}</>}
                      </div>
                    </td>
                    <td className="hidden py-2 pr-3 break-words lg:table-cell">{p.paid_for}</td>
                    <td className="hidden py-2 pr-3 whitespace-nowrap text-subtle md:table-cell">{PAYMENT_METHODS[p.method]}</td>
                    {showProject && <td className="hidden py-2 pr-3 md:table-cell">{codes(p.project_ids)}</td>}
                    <td className="py-2 pr-4 text-right">
                      <span className="whitespace-nowrap tabular-nums">{formatNPR(p.amount_paisa)}</span>
                      {badge && <div className="mt-1">{badge}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <ShowMore list={payments} total={total} />
    </>
  )
}
