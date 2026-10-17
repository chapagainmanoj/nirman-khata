// Company dashboard (req §18.1): spent so far and left to spend on the running projects, and what is
// to pay now; for the chosen period, where the money went and what was spent, paid out and received; each thing that needs attention, named, with the way to deal with
// it; and each project's work done against budget used, with what is still missing from its cost
// (completeness, §18.2). Every figure links on.
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { ArrowRightIcon } from '../../components/icons'
import { Badge, ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { fiscalYear, fiscalYearRange, formatDate, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { monthDays, monthLabel, monthOf } from '../../lib/months'
import type { ProjectStatus } from '../../lib/supabase'
import type { PartyKind } from '../parties/kinds'
import { rpc } from '../supply/api'
import { canEnter, canPost, canRecordPayments } from '../supply/permissions'
import { type AttentionRow, attentionRows, foldAttention } from './attention'
import { Completeness, type ProjectFigures, SourceRows, UsedBars } from './parts'
import { runningTotals } from './totals'

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
  cost_by_source_period?: NonNullable<ProjectFigures['by_source']>
  overpaid_parties?: Array<{ party_id: string; kind: PartyKind; name: string; overpaid_paisa: number }>
  unbilled_by_supplier?: Array<{ supplier_id: string; name: string; lines: number; first_item: string; oldest_date: string }>
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
  const attention = attentionRows(d, {
    enter: canEnter(auth), approve: auth.isAdmin || !!auth.membership?.can_approve_slips, post: canPost(auth), pay: canRecordPayments(auth),
  }, today)

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${auth.company.name} · as of ${formatDate(today, auth.dateDisplay)}`}
        actions={<ButtonLink variant="secondary" to="/reports">Reports</ButtonLink>} />
      {/* What the owner asks first: how much has gone out and how much budget is left on the
          running projects, so far; and beside it, what is owed today. Not tied to the period. */}
      {d.money_visible && (
        <div className="mb-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <RunningBlock projects={d.projects} />
          <Group title="Right now" tiles>
            <Figure tile tone="warn" label="To pay" value={owedTotal}
              sub={Object.entries(owed).filter(([, n]) => n).map(([k, n]) => `${OWED_LABEL[k as keyof typeof OWED_LABEL]} ${formatNPR(n, { whole: true })}`).join(' · ') || 'Nothing to pay'}
              to="/parties" />
            {!!d.peski_paisa && <Figure tile tone="neutral" label="Peski not yet used" value={d.peski_paisa} sub="Deducted from their bills as they come" to="/parties" />}
          </Group>
        </div>
      )}

      {/* The chosen period: where the money went, then what was spent, paid out and received. */}
      {d.money_visible && (
        <section aria-label="Totals" className="mb-6 border-y border-line py-4">
          <div className="flex gap-1 rounded-lg bg-muted p-1 sm:w-fit" role="radiogroup" aria-label="Period">
            {([['month', 'This month'], ['year', 'This fiscal year'], ['all', 'All time']] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={period === k} onClick={() => setPeriod(k)}
                className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none [@media(pointer:fine)]:min-h-8 ${period === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid max-w-xl gap-6">
            {d.cost_by_source_period && (
              <div>
                <h2 className="mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">Where the money went</h2>
                <SourceRows bySource={d.cost_by_source_period} total={d.cost_period_paisa ?? 0} whole />
              </div>
            )}
            <div>
              <h2 className="mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">{range.label}</h2>
              <ul>
                <MoneyRow label="Spent" value={d.cost_period_paisa} to="/reports/project-cost" />
                <MoneyRow label="Paid out" value={d.cash_period_paisa} to="/reports/payments" />
                <MoneyRow label="Received" value={d.received_period_paisa} to="/projects" />
              </ul>
            </div>
          </div>
        </section>
      )}

      {attention.length > 0 && <NeedsAttention rows={attention} />}

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
        <span className="block text-xl font-semibold whitespace-nowrap tabular-nums group-hover:underline sm:text-2xl">{formatNPR(value ?? 0, { whole: true })}</span>
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

/** One period figure as a row (label, amount), linking to where it comes from. */
function MoneyRow({ label, value, to }: { label: string; value: number | undefined; to: string }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link to={to} className="group flex min-h-11 items-center justify-between gap-3 py-2 text-sm [@media(pointer:fine)]:min-h-9">
        <span className="text-subtle">{label}</span>
        <span className="font-semibold text-ink tabular-nums group-hover:underline">{formatNPR(value ?? 0, { whole: true })}</span>
      </Link>
    </li>
  )
}

/**
 * Running projects added up: spent so far, and left to spend with the budget under it. Each
 * project's own figures are on its card below.
 */
function RunningBlock({ projects }: { projects: Dashboard['projects'] }) {
  const r = runningTotals(projects)
  if (r.count === 0) return null
  const over = r.left < 0
  return (
    <section aria-label="Running projects" className="min-w-0">
      <div>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Running projects ({r.count})</h2>
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <Link to="/reports/project-cost" className="group block min-w-0">
            <span className="block text-sm font-medium text-subtle">Spent so far</span>
            <span className="block text-2xl font-semibold whitespace-nowrap sm:text-3xl text-ink tabular-nums group-hover:underline">{formatNPR(r.spent, { whole: true })}</span>
          </Link>
          <Link to="/reports/budget-vs-cost" className="group block min-w-0">
            <span className={`block text-sm font-medium ${over ? 'text-danger' : 'text-subtle'}`}>{over ? 'Over budget by' : 'Left to spend'}</span>
            <span className={`block text-2xl font-semibold whitespace-nowrap sm:text-3xl tabular-nums group-hover:underline ${over ? 'text-danger' : 'text-ink'}`}>
              {r.budget ? formatNPR(Math.abs(r.left), { whole: true }) : 'Not set'}
            </span>
            <span className="mt-1 block text-sm text-subtle">
              {r.budget ? <>of <span className="font-semibold text-ink tabular-nums">{formatNPR(r.budget, { whole: true })}</span> budget</> : 'No spending budget set'}
            </span>
          </Link>
        </div>
        {r.usedPct !== null && (
          <span className="mt-4 block h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Running projects: share of budget spent"
            aria-valuenow={Math.round(r.usedPct)} aria-valuemin={0} aria-valuemax={100}>
            <span className={`block h-full rounded-full ${over ? 'bg-danger' : 'bg-bar'}`} style={{ width: `${Math.min(100, r.usedPct)}%` }} />
          </span>
        )}
        {r.budget > 0 && r.noBudget.length > 0 && (
          <p className="mt-2 text-xs text-subtle">{r.noBudget.join(', ')} {r.noBudget.length === 1 ? 'has' : 'have'} no budget, so {r.noBudget.length === 1 ? 'it is' : 'they are'} not in “left”.</p>
        )}
      </div>
    </section>
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

/**
 * Decisions first, all shown; then "Records to complete", three at a time. Opens short every
 * time: the list is a glance, not a worklist.
 */
function NeedsAttention({ rows }: { rows: AttentionRow[] }) {
  const [all, setAll] = useState(false)
  const fold = foldAttention(rows)
  const decide = all ? rows.filter((r) => r.kind === 'decide') : fold.decide
  const record = all ? rows.filter((r) => r.kind === 'record') : fold.record
  const recordTotal = rows.filter((r) => r.kind === 'record').length
  return (
    <Card title="Needs attention" className="mb-4">
      {decide.length > 0 && <AttentionList rows={decide} />}
      {record.length > 0 && (
        <>
          {decide.length > 0 && (
            <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-subtle uppercase">Records to complete ({recordTotal})</h3>
          )}
          <AttentionList rows={record} />
        </>
      )}
      {fold.hidden.length > 0 && (
        <button type="button" aria-expanded={all} onClick={() => setAll(!all)}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-slate underline underline-offset-4 hover:text-ink [@media(pointer:fine)]:min-h-9">
          {all ? 'Show fewer' : `Show ${fold.hidden.length} more`}
        </button>
      )}
    </Card>
  )
}

function AttentionList({ rows }: { rows: AttentionRow[] }) {
  return (
    <ul>
      {rows.map((a) => (
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
  )
}
