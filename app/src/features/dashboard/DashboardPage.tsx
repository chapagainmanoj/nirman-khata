// Company dashboard (req §18.1): spent so far and left to spend on the running projects, where that
// money went, and what is to pay now; each thing that needs attention, named, with the way to deal
// with it (decisions shown, records folded); and each project's work done against budget used, with what is still missing from its cost
// (completeness, §18.2). Every figure links on.
import { useQuery } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { ArrowRightIcon, ChevronDownIcon } from '../../components/icons'
import { Badge, ButtonLink, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui'
import { formatDate, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR, percent } from '../../lib/money'
import type { ProjectStatus } from '../../lib/supabase'
import type { PartyKind } from '../parties/kinds'
import { rpc } from '../supply/api'
import { canEnter, canPost, canRecordPayments } from '../supply/permissions'
import { type AttentionRow, attentionRows, count, foldAttention } from './attention'
import { Completeness, type ProjectFigures, SourceBar, UsedBars } from './parts'
import { runningTotals } from './totals'

type Dashboard = {
  money_visible: boolean
  projects: Array<ProjectFigures & { id: string; code: string; name: string; status: ProjectStatus }>
  counts: { slips_to_approve: number; slips_waiting: number; unbilled_lines: number; bills_to_post: number }
  payable_by_kind?: Record<'supplier' | 'subcontractor' | 'crew' | 'payee', number>
  peski_paisa?: number
  overpaid_paisa?: number
  unallocated_paisa?: number
  overpaid_parties?: Array<{ party_id: string; kind: PartyKind; name: string; overpaid_paisa: number }>
  unbilled_by_supplier?: Array<{ supplier_id: string; name: string; lines: number; first_item: string; oldest_date: string }>
}

<<<<<<< HEAD
const OWED_LABEL = { supplier: 'Suppliers', subcontractor: 'Subcontractors', crew: 'Labour crews', payee: 'Other payees' } as const
=======
const OWED_LABEL = { supplier: 'Suppliers', subcontractor: 'Subcontractors', crew: 'Labour crews', payee: 'Other services' } as const
>>>>>>> develop

export function DashboardPage() {
  const auth = useCompany()
  const today = todayKathmandu()
  // No period on the dashboard (product owner, 2026-10-17): month and year figures are in Reports.
  // The function still takes a range; today alone keeps its period figures small.
  const dash = useQuery({
    queryKey: ['dashboard', auth.companyId, today],
    queryFn: async () => (await rpc('company_dashboard', { p_company: auth.companyId, p_from: today, p_to: today, p_as_of: today })) as unknown as Dashboard,
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
        actions={<ButtonLink variant="secondary" to="/reports">View detailed reports</ButtonLink>} />
      {/* What the owner asks first: how much has gone out and how much budget is left on the
          running projects, so far, and where it went; and beside it, what is owed today. */}
      {d.money_visible && (
        <RunningBlock projects={d.projects}>
          <Figure label="To pay" value={owedTotal}
            sub={Object.entries(owed).filter(([, n]) => n).map(([k, n]) => `${OWED_LABEL[k as keyof typeof OWED_LABEL]} ${formatNPR(n, { whole: true })}`).join(' · ') || 'Nothing to pay'}
            to="/parties" />
          {!!d.peski_paisa && <Figure label="Peski not yet used" value={d.peski_paisa} sub="Deducted from their bills as they come" to="/parties" />}
        </RunningBlock>
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

/** One figure, set like "Spent so far": plain ink, no tile (product owner, 2026-10-17). */
function Figure({ label, value, sub, to }: { label: string; value: number | undefined; sub?: string; to: string }) {
  return (
    <Link to={to} className="group block min-w-0">
      <span className="block text-sm font-medium text-subtle">{label}</span>
      <span className="block text-2xl font-semibold whitespace-nowrap text-ink tabular-nums group-hover:underline sm:text-3xl">{formatNPR(value ?? 0, { whole: true })}</span>
      {sub && <span className="mt-1 block text-sm text-subtle">{sub}</span>}
    </Link>
  )
}

/**
 * Running projects added up, in one card: spent so far, left to spend with the budget under it,
 * and what is to pay now; then the share of
 * budget used and where the money went. Each project's own figures are on its card below.
 * With no running project, only what is owed shows.
 */
function RunningBlock({ projects, children }: { projects: Dashboard['projects']; children: ReactNode }) {
  const r = runningTotals(projects)
  if (r.count === 0) return <div className="mb-6"><Group title="Right now">{children}</Group></div>
  const over = r.left < 0
  return (
    <section aria-label="Running projects" className="mb-6 min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase">Running projects ({r.count})</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,auto)]">
        <Link to="/reports/project-cost" className="group block min-w-0">
          <span className="block text-sm font-medium text-subtle">Spent so far</span>
          <span className="block text-2xl font-semibold whitespace-nowrap text-ink tabular-nums group-hover:underline sm:text-3xl">{formatNPR(r.spent, { whole: true })}</span>
        </Link>
        <Link to="/reports/budget-vs-cost" className="group block min-w-0">
          <span className={`block text-sm font-medium ${over ? 'text-danger' : 'text-subtle'}`}>{over ? 'Over budget by' : 'Left to spend'}</span>
          <span className={`block text-2xl font-semibold whitespace-nowrap tabular-nums group-hover:underline sm:text-3xl ${over ? 'text-danger' : 'text-ink'}`}>
            {r.budget ? formatNPR(Math.abs(r.left), { whole: true }) : 'Not set'}
          </span>
          <span className="mt-1 block text-sm text-subtle">
            {r.budget ? <>of <span className="font-semibold text-ink tabular-nums">{formatNPR(r.budget, { whole: true })}</span> budget</> : 'No spending budget set'}
          </span>
        </Link>
        {/* What is owed now, set apart by a rule on a wide screen. */}
        <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 lg:col-span-1 lg:grid-cols-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">{children}</div>
      </div>

      {r.usedPct !== null && (
        <div className="mt-5">
          <span className="mb-1.5 flex justify-between gap-3 text-xs text-subtle">
            <span>Budget used</span>
            <span className={`font-semibold tabular-nums ${over ? 'text-danger' : 'text-ink'}`}>{percent(r.budget - r.left, r.budget)}</span>
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Running projects: share of budget spent"
            aria-valuenow={Math.round(r.usedPct)} aria-valuemin={0} aria-valuemax={100}>
            <span className={`block h-full min-w-1 rounded-full ${over ? 'bg-danger' : 'bg-bar'}`} style={{ width: `${Math.min(100, r.usedPct)}%` }} />
          </span>
        </div>
      )}
      {r.budget > 0 && r.noBudget.length > 0 && (
        <p className="mt-2 text-xs text-subtle">{r.noBudget.join(', ')} {r.noBudget.length === 1 ? 'has' : 'have'} no budget, so {r.noBudget.length === 1 ? 'it is' : 'they are'} not in “left”.</p>
      )}

      {r.bySource && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">Where the money went</h3>
          <SourceBar bySource={r.bySource} total={r.spent} />
        </div>
      )}
    </section>
  )
}

/** A labelled set of figures. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">{title}</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{children}</div>
    </div>
  )
}

/**
 * Decisions shown, one line each (an order slip waiting holds up the site); records to complete
 * folded behind one line with their count. Opens short every time: a glance, not a worklist.
 */
function NeedsAttention({ rows }: { rows: AttentionRow[] }) {
  const [moreDecide, setMoreDecide] = useState(false)
  const [records, setRecords] = useState(false)
  const fold = foldAttention(rows)
  const decide = moreDecide ? [...fold.decide, ...fold.moreDecide] : fold.decide
  return (
    <Card title="Needs attention" className="mb-4">
      {decide.length > 0 && <AttentionList rows={decide} />}
      {fold.moreDecide.length > 0 && (
        <button type="button" aria-expanded={moreDecide} onClick={() => setMoreDecide(!moreDecide)}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-slate underline underline-offset-4 hover:text-ink [@media(pointer:fine)]:min-h-9">
          {moreDecide ? 'Show fewer' : `Show ${fold.moreDecide.length} more`}
        </button>
      )}
      {fold.record.length > 0 && (
        <div className={decide.length > 0 ? 'mt-1 border-t border-line' : ''}>
          <button type="button" aria-expanded={records} onClick={() => setRecords(!records)}
            className="group flex min-h-11 w-full items-center gap-3 py-2 text-left text-sm">
            <span className="min-w-0 flex-1 text-ink">{count(fold.record.length, 'record to complete', 'records to complete')}</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-brand group-hover:underline">
              {records ? 'Hide' : 'Show'}<ChevronDownIcon size={16} className={records ? 'rotate-180' : ''} />
            </span>
          </button>
          {records && <div className="border-t border-line pl-3"><AttentionList rows={fold.record} /></div>}
        </div>
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
