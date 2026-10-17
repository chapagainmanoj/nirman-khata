// Company dashboard (req §18.1): what was spent, paid out and received in the chosen period; what is
// to pay and to collect right now; each thing that needs attention, named, with the way to deal with
// it; and each project's work done against budget used, with what is still missing from its cost
// (completeness, §18.2). Every figure links on.
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { ArrowRightIcon } from '../../components/icons'
import { Badge, ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { fiscalYear, fiscalYearRange, formatDate, relativeDay, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { monthDays, monthLabel, monthOf } from '../../lib/months'
import type { ProjectStatus } from '../../lib/supabase'
import { PARTY, type PartyKind } from '../parties/kinds'
import { rpc } from '../supply/api'
import { canEnter, canPost, canRecordPayments } from '../supply/permissions'
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
  peski_paisa?: number
  overpaid_paisa?: number
  unallocated_paisa?: number
  received_period_paisa?: number
  received_to_date_paisa?: number
  to_collect_paisa?: number
  overpaid_parties?: Array<{ party_id: string; kind: PartyKind; name: string; overpaid_paisa: number }>
  unbilled_by_supplier?: Array<{ supplier_id: string; name: string; lines: number; first_item: string; oldest_date: string }>
}

/** "1 slip", "2 slips". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

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

  // One row per thing to deal with: what it is, and the action that deals with it. Work waiting
  // on someone first, then money that is not right.
  const unbilled = d.unbilled_by_supplier ?? []
  const attention: Array<{ key: string; text: string; action: string; to: string }> = [
    ...unbilled.map((u) => ({
      key: `unbilled:${u.supplier_id}`,
      text: `${u.first_item}${u.lines > 1 ? ` and ${u.lines - 1} more` : ''} from ${u.name}, came ${relativeDay(u.oldest_date, today)}; no bill yet, so cost is incomplete`,
      action: canEnter(auth) ? 'Enter bill' : 'See supplier',
      to: canEnter(auth) ? `/bills/new?supplier=${u.supplier_id}` : `/suppliers/${u.supplier_id}`,
    })),
    // The action word only for someone who may do it; the database checks again.
    ...(d.counts.slips_to_approve ? [{
      key: 'approve', text: `${count(d.counts.slips_to_approve, 'order slip', 'order slips')} waiting for approval`,
      action: auth.isAdmin || auth.membership?.can_approve_slips ? 'Approve' : 'See order slips', to: '/slips',
    }] : []),
    ...(d.counts.bills_to_post ? [{
      key: 'post', text: `${count(d.counts.bills_to_post, 'bill', 'bills')} sent to Accounts to post`,
      action: canPost(auth) ? 'Post' : 'See bills', to: '/bills',
    }] : []),
    ...(d.overpaid_parties ?? []).map((p) => ({
      key: `overpaid:${p.party_id}`,
      text: `${p.name} holds ${formatNPR(p.overpaid_paisa)} overpaid; it comes off their next bills`,
      action: `See ${PARTY[p.kind].one.toLowerCase()}`,
      to: `${PARTY[p.kind].path}/${p.party_id}`,
    })),
    ...over.map((p) => ({
      key: `over:${p.id}`,
      text: `${p.code} · ${p.name} is over budget by ${formatNPR(Number(p.cost_paisa) - p.budget_paisa!)} (spent ${formatNPR(Number(p.cost_paisa))} of ${formatNPR(p.budget_paisa!)})`,
      action: 'See project',
      to: `/projects/${p.id}`,
    })),
    ...headingOver.map((p) => {
      const names = p.by_heading!.filter((h) => h.over).map((h) => h.name)
      return {
        key: `heading:${p.id}`,
        text: `${p.code} · ${p.name}: ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} over the heading budget`,
        action: 'See report',
        to: '/reports/budget-vs-cost',
      }
    }),
    ...((d.unallocated_paisa ?? 0) > 0 ? [{
      key: 'unallocated', text: `${formatNPR(d.unallocated_paisa!)} paid but not given to a project yet`,
      action: canRecordPayments(auth) ? 'Assign' : 'See payments', to: '/payments',
    }] : []),
    ...(d.counts.slips_waiting ? [{ key: 'waiting', text: `${count(d.counts.slips_waiting, 'approved order slip', 'approved order slips')} still to be delivered`, action: 'See list', to: '/reports/pending' }] : []),
  ]
  // A dashboard from before the supplier list came with only the count.
  if (!d.unbilled_by_supplier && d.counts.unbilled_lines) {
    attention.unshift({ key: 'unbilled', text: `${count(d.counts.unbilled_lines, 'received item', 'received items')} not billed yet, so cost is incomplete`, action: 'See list', to: '/reports/pending' })
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${auth.company.name} · as of ${formatDate(today, auth.dateDisplay)}`}
        actions={<ButtonLink variant="secondary" to="/reports">Reports</ButtonLink>} />
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 sm:w-fit" role="radiogroup" aria-label="Period">
        {([['month', 'This month'], ['year', 'This fiscal year'], ['all', 'All time']] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={period === k} onClick={() => setPeriod(k)}
            className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none ${period === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Two quiet groups of figures, not boxed cards: what the period tabs change, and where
          things stand today. "To date" only when it differs from the period figure. */}
      {d.money_visible && (
        <section aria-label="Totals" className="mb-6 grid gap-x-10 gap-y-5 border-b border-line pb-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Group title={range.label}>
            <Figure label="Spent" value={d.cost_period_paisa} sub={toDate(d.cost_period_paisa, d.cost_to_date_paisa)} to="/reports/project-cost" />
            <Figure label="Paid out" value={d.cash_period_paisa} sub={toDate(d.cash_period_paisa, d.cash_to_date_paisa)} to="/reports/payments" />
            <Figure label="Received" tone={(d.received_period_paisa ?? 0) > 0 ? 'good' : undefined} value={d.received_period_paisa}
              sub={(d.received_period_paisa ?? 0) < 0 ? 'Less a receipt reversed in this period'
                : toDate(d.received_period_paisa, d.received_to_date_paisa) ?? 'From clients'} to="/projects" />
          </Group>
          <Group title="Right now" tiles>
            <Figure tile tone="warn" label="To pay" value={owedTotal}
              sub={Object.entries(owed).filter(([, n]) => n).map(([k, n]) => `${OWED_LABEL[k as keyof typeof OWED_LABEL]} ${formatNPR(n)}`).join(' · ') || 'Nothing to pay'}
              to="/parties" />
            <Figure tile tone="brand" label="To collect" value={d.to_collect_paisa} sub="Left on client contracts" to="/projects" />
            {!!d.peski_paisa && <Figure tile tone="neutral" label="Peski not yet used" value={d.peski_paisa} sub="Deducted from their bills as they come" to="/parties" />}
          </Group>
        </section>
      )}

      {attention.length > 0 && (
        <Card title="Needs attention" className="mb-4">
          <ul>
            {attention.map((a) => (
              <li key={a.key} className="border-b border-line last:border-0">
                <Link to={a.to} className="group flex min-h-11 items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 text-ink">{a.text}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-brand group-hover:underline">
                    {a.action}<ArrowRightIcon size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Projects</h2>
      {d.projects.length === 0 && <EmptyState title="No open projects">Create a project to see it here.</EmptyState>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {d.projects.map((p) => (
          // The whole card opens the project (stretched title link); "Set progress" sits above it.
          <li key={p.id} className="relative h-full rounded-xl border border-line bg-surface p-4 hover:border-subtle">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/projects/${p.id}`} className="font-semibold text-ink after:absolute after:inset-0 after:rounded-xl">{p.code} · {p.name}</Link>
              <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
            </span>
            <UsedBars figures={p} setProgress={canEnter(auth) ? `/projects/${p.id}?tab=site` : undefined} />
            {d.money_visible && (
              <span className="mt-2 block text-sm text-subtle">
                Spent <span className="font-semibold text-ink tabular-nums">{formatNPR(Number(p.cost_paisa ?? 0))}</span>
                {p.budget_paisa ? <> of {formatNPR(p.budget_paisa)} budget</> : null}
              </span>
            )}
            <Completeness figures={p} status={p.status} compact />
          </li>
        ))}
      </ul>
    </>
  )
}

/** "To date Rs. …" under a period figure, or nothing when it would repeat the figure. */
function toDate(period: number | undefined, total: number | undefined) {
  return (period ?? 0) === (total ?? 0) ? undefined : `To date ${formatNPR(total ?? 0)}`
}

type Tone = 'warn' | 'brand' | 'good' | 'neutral'

// Colour by meaning, and only where someone can act (PRODUCT.md: calm by default). A tile is
// the "Right now" treatment; a period figure only tints its amount.
const TILE: Record<Tone, string> = {
  warn: 'bg-warn-soft text-warn-ink',
  brand: 'bg-brand-soft text-brand-dark',
  good: 'bg-good-soft text-good-ink',
  neutral: 'bg-info-soft text-info-ink',
}
const AMOUNT: Record<Tone, string> = { warn: 'text-warn-ink', brand: 'text-brand-dark', good: 'text-good-ink', neutral: 'text-ink' }

/** One figure. `tone` applies only when the amount is not zero, so an all-clear screen stays plain. */
function Figure({ label, value, sub, to, tone, tile }: {
  label: string; value: number | undefined; sub?: string; to: string; tone?: Tone; tile?: boolean
}) {
  const t = value ? tone : undefined
  if (tile) {
    return (
      <Link to={to} className={`group block flex-1 basis-40 rounded-lg px-3 py-2.5 ${t ? TILE[t] : 'bg-muted text-ink'}`}>
        <span className="block text-xs font-medium opacity-85">{label}</span>
        <span className="block text-xl font-semibold whitespace-nowrap tabular-nums group-hover:underline sm:text-2xl">{formatNPR(value ?? 0)}</span>
        {sub && <span className="mt-0.5 block text-xs opacity-85">{sub}</span>}
      </Link>
    )
  }
  return (
    <Link to={to} className="group block min-w-0">
      <span className="block text-xs font-medium text-subtle">{label}</span>
      <span className={`block text-xl font-semibold tabular-nums group-hover:underline sm:text-2xl ${t ? AMOUNT[t] : 'text-ink'}`}>{formatNPR(value ?? 0)}</span>
      {sub && <span className="mt-0.5 block text-xs text-subtle">{sub}</span>}
    </Link>
  )
}

/** A labelled set of figures in the totals. */
function Group({ title, tiles, children }: { title: string; tiles?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{title}</h2>
      {/* Tiles size to their amount (never wrapped mid-number) and share a row evenly. */}
      <div className={tiles ? 'flex flex-wrap gap-3 lg:flex-nowrap' : 'grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]'}>{children}</div>
    </div>
  )
}
