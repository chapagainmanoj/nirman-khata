// Company dashboard (req §18.1): cost and cash for the period and to date, what is owed and
// paid ahead, what needs attention, and each project's work done against budget used, with
// what is still missing from its recorded cost (completeness, §18.2). Every figure links on.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { fiscalYear, fiscalYearRange, formatDate, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { monthDays, monthLabel, monthOf } from '../../lib/months'
import type { ProjectStatus } from '../../lib/supabase'
import { rpc } from '../supply/api'
import { Completeness, type ProjectFigures, UsedBars } from './parts'

type Period = 'month' | 'year' | 'all'

type Dashboard = {
  money_visible: boolean
  projects: Array<ProjectFigures & { id: string; code: string; name: string; status: ProjectStatus }>
  counts: { slips_to_approve: number; slips_waiting: number; unbilled_lines: number; bills_to_post: number }
  cost_period_paisa?: number
  cash_period_paisa?: number
  cost_to_date_paisa?: number
  cash_to_date_paisa?: number
  payable_by_kind?: Record<'supplier' | 'subcontractor' | 'crew' | 'payee', number>
  advances_paisa?: number
  unallocated_paisa?: number
}

const OWED_LABEL = { supplier: 'Suppliers', subcontractor: 'Subcontractors', crew: 'Labour crews', payee: 'Other payees' } as const

export function DashboardPage() {
  const auth = useCompany()
  const today = todayKathmandu()
  const [period, setPeriod] = useState<Period>('month')
  const month = monthOf(today, auth.dateDisplay)
  const fy = fiscalYear(today)
  const range = period === 'month'
    ? { from: monthDays(month)[0], to: today, label: monthLabel(month) }
    : period === 'year'
      ? { from: fiscalYearRange(fy).start, to: today, label: `Fiscal year ${fy}` }
      : { from: '2000-01-01', to: today, label: 'All time' }

  const dash = useQuery({
    queryKey: ['dashboard', auth.companyId, range.from, range.to],
    queryFn: async () => (await rpc('company_dashboard', { p_company: auth.companyId, p_from: range.from, p_to: range.to, p_as_of: today })) as unknown as Dashboard,
  })

  if (dash.isPending) return <Spinner />
  if (dash.error) return <ErrorBanner onRetry={() => void dash.refetch()}>{friendlyError(dash.error)}</ErrorBanner>
  const d = dash.data
  const owed = d.payable_by_kind ?? { supplier: 0, subcontractor: 0, crew: 0, payee: 0 }
  const owedTotal = Object.values(owed).reduce((s, n) => s + n, 0)
  const over = d.projects.filter((p) => p.budget_paisa && Number(p.cost_paisa) > p.budget_paisa)
  const headingOver = d.projects.filter((p) => !over.includes(p) && p.by_heading?.some((h) => h.over))

  // Count, what it is, where to deal with it. Items with nothing waiting are left out.
  const attention: Array<{ n: number; text: string; to: string }> = [
    { n: d.counts.slips_to_approve, text: 'slip(s) waiting for approval', to: '/slips' },
    { n: d.counts.bills_to_post, text: 'bill(s) sent to Accounts to post', to: '/bills' },
    { n: d.counts.unbilled_lines, text: 'received item(s) not billed yet, so cost is incomplete', to: '/reports/pending' },
    { n: d.counts.slips_waiting, text: 'approved slip(s) waiting for delivery', to: '/reports/pending' },
    { n: over.length, text: `project(s) over budget: ${over.map((p) => p.code).join(', ')}`, to: '/reports/budget-vs-cost' },
    { n: headingOver.length, text: `project(s) over a heading budget: ${headingOver.map((p) => p.code).join(', ')}`, to: '/reports/budget-vs-cost' },
  ].filter((a) => a.n > 0)
  const unallocated = d.unallocated_paisa ?? 0

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${auth.company.name} · as of ${formatDate(today, auth.dateDisplay)}`} />
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 sm:w-fit" role="radiogroup" aria-label="Period">
        {([['month', 'This month'], ['year', 'This fiscal year'], ['all', 'All time']] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={period === k} onClick={() => setPeriod(k)}
            className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none ${period === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {label}
          </button>
        ))}
      </div>

      {d.money_visible && (
        <section aria-label="Totals" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label={`Recorded cost, ${range.label}`} value={d.cost_period_paisa} sub={`To date ${formatNPR(d.cost_to_date_paisa ?? 0)}`} to="/reports/project-cost" />
          <Figure label={`Cash paid, ${range.label}`} value={d.cash_period_paisa} sub={`To date ${formatNPR(d.cash_to_date_paisa ?? 0)}`} to="/reports/payments" />
          <Figure label="Still owed" value={owedTotal}
            sub={Object.entries(owed).filter(([, n]) => n).map(([k, n]) => `${OWED_LABEL[k as keyof typeof OWED_LABEL]} ${formatNPR(n)}`).join(' · ') || 'Nothing owed'}
            to="/parties" />
          <Figure label="Paid in advance" value={d.advances_paisa} sub="Payments not yet matched to charges" to="/parties" />
        </section>
      )}

      {(attention.length > 0 || unallocated > 0) && (
        <Card title="Needs attention" className="mb-4">
          <ul>
            {attention.map((a) => (
              <li key={a.text} className="border-b border-line last:border-0">
                <Link to={a.to} className="flex min-h-11 items-center gap-2 py-2 text-sm hover:underline">
                  <span className="font-semibold text-ink tabular-nums">{a.n}</span><span>{a.text}</span>
                </Link>
              </li>
            ))}
            {unallocated > 0 && (
              <li>
                <Link to="/payments" className="flex min-h-11 items-center gap-2 py-2 text-sm hover:underline">
                  <span className="font-semibold text-ink tabular-nums">{formatNPR(unallocated)}</span><span>paid but not given to a project yet</span>
                </Link>
              </li>
            )}
          </ul>
        </Card>
      )}

      <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Projects</h2>
      {d.projects.length === 0 && <EmptyState title="No open projects">Create a project to see it here.</EmptyState>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {d.projects.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} className="block h-full rounded-xl border border-line bg-surface p-4 hover:border-brand">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{p.code} · {p.name}</span>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
              </span>
              <UsedBars figures={p} />
              {d.money_visible && (
                <span className="mt-2 block text-sm text-subtle">
                  Recorded cost <span className="font-semibold text-ink tabular-nums">{formatNPR(Number(p.cost_paisa ?? 0))}</span>
                  {p.budget_paisa ? <> of {formatNPR(p.budget_paisa)}</> : null}
                </span>
              )}
              <Completeness figures={p} compact />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function Figure({ label, value, sub, to }: { label: string; value: number | undefined; sub: string; to: string }) {
  return (
    <Link to={to} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
      <span className="block text-xs font-medium text-subtle">{label}</span>
      <span className="block text-2xl font-semibold text-ink tabular-nums">{formatNPR(value ?? 0)}</span>
      <span className="mt-1 block text-xs text-subtle">{sub}</span>
    </Link>
  )
}
