// Pieces shared by the company dashboard and the project page (req §18.1, §18.2).
// Work done and budget used are always shown separately (acceptance #10); work done that was
// never entered shows a way to set it rather than an empty bar. Recorded cost comes with a
// quiet note of what is still missing from it (completeness).
import type { ProjectStatus } from '../../lib/supabase'
import { Link } from 'react-router'
import { formatNPR, percent } from '../../lib/money'

/** The figures project_dashboard returns (amounts are null for people who cannot see money). */
export type ProjectFigures = {
  project_id?: string
  money_visible: boolean
  progress_pct: number | null
  last_report_date: string | null
  days_since_report: number | null
  slips_waiting: number
  unbilled_lines: number
  unbilled_estimate_paisa: number | null
  unbilled_without_rate: number
  draft_bills: number | null
  draft_bills_paisa: number | null
  contract_paisa: number | null
  original_contract_paisa: number | null
  budget_paisa: number | null
  original_budget_paisa: number | null
  budget_effective_date: string | null
  planned_margin_paisa: number | null
  cost_paisa: number | null
  cash_paid_paisa: number | null
  payable_paisa: number | null
  advances_paisa: number | null
  by_heading: Array<{ heading_id: string; name: string; parent: string | null; budget_paisa: number | null; cost_paisa: number; over: boolean }> | null
  by_source: Record<'materials' | 'subcontract' | 'labour' | 'other', number> | null
  final_result_paisa: number | null
}

function Bar({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  const width = Math.max(0, Math.min(100, value ?? 0))
  return (
    <span className="block">
      <span className="flex justify-between text-xs text-subtle">
        <span>{label}</span>
        <span className="font-semibold text-ink tabular-nums">{value === null ? 'Not set' : `${Number(value.toFixed(1))}%`}</span>
      </span>
      <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label}
        aria-valuenow={Math.round(value ?? 0)} aria-valuemin={0} aria-valuemax={100}>
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </span>
    </span>
  )
}

/**
 * Physical progress against budget used, side by side. Bars are neutral; only over budget is red.
 * `setProgress` is where to enter progress when none is set (omit for people who cannot).
 */
export function UsedBars({ figures: f, setProgress }: { figures: ProjectFigures; setProgress?: string }) {
  const used = f.budget_paisa ? (Number(f.cost_paisa) / f.budget_paisa) * 100 : null
  return (
    <span className="mt-3 grid gap-2 sm:grid-cols-2">
      {f.progress_pct === null ? (
        <span className="flex justify-between text-xs text-subtle">
          <span>Work done</span>
          {setProgress
            ? <Link to={setProgress} className="relative z-10 font-medium text-brand hover:underline">Set progress <span aria-hidden>→</span></Link>
            : <span>Not set</span>}
        </span>
      ) : <Bar label="Work done" value={Number(f.progress_pct)} tone="bg-bar" />}
      {f.money_visible && <Bar label="Budget used" value={used} tone={used !== null && used > 100 ? 'bg-danger' : 'bg-bar'} />}
    </span>
  )
}

/**
 * What the recorded cost does not include yet: unbilled receipts, unposted bills, a quiet site.
 * Quiet grey text, not a banner: it qualifies the number, nothing is wrong. Planned projects
 * have nothing to be missing yet, so they show nothing.
 */
export function Completeness({ figures: f, compact, status }: { figures: ProjectFigures; compact?: boolean; status?: ProjectStatus }) {
  if (status === 'planned') return null
  const items: string[] = []
  if (f.unbilled_lines > 0) {
    const est = f.money_visible && f.unbilled_estimate_paisa
      ? ` (about ${formatNPR(f.unbilled_estimate_paisa)}${f.unbilled_without_rate ? ', some with no rate yet' : ''})` : ''
    items.push(`${f.unbilled_lines} received item${f.unbilled_lines === 1 ? '' : 's'} not billed${est}`)
  }
  if (f.draft_bills) {
    items.push(`${f.draft_bills} bill${f.draft_bills === 1 ? '' : 's'} not posted${f.draft_bills_paisa ? ` (${formatNPR(f.draft_bills_paisa)} typed)` : ''}`)
  }
  if (f.days_since_report === null) items.push('no daily report yet')
  else if (f.days_since_report > 2) items.push(`last daily report ${f.days_since_report} days ago`)
  if (!items.length) return compact ? null : <p className="mt-2 text-xs text-subtle">Nothing waiting: every receipt is billed and posted.</p>
  return (
    <span className={`mt-2 block text-subtle ${compact ? 'text-xs' : 'text-sm'}`}>
      Not in recorded cost yet: {items.join(' · ')}
    </span>
  )
}

/** Heading budget against recorded cost, as a table with bars (over budget in red). */
export function HeadingTable({ figures: f, projectId }: { figures: ProjectFigures; projectId: string }) {
  const rows = f.by_heading ?? []
  if (!rows.length) return <p className="text-sm text-subtle">No cost or heading budget yet.</p>
  return (
    <>
      <ul>
        {rows.map((h) => {
          const used = h.budget_paisa ? (h.cost_paisa / h.budget_paisa) * 100 : null
          return (
            <li key={h.heading_id} className="border-b border-line py-2 last:border-0">
              <span className="flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="min-w-0 text-ink">{h.parent ? `${h.parent} › ` : ''}{h.name}</span>
                <span className={`tabular-nums ${h.over ? 'font-semibold text-danger' : 'text-ink'}`}>
                  {formatNPR(h.cost_paisa)}{h.budget_paisa !== null && <span className="text-subtle"> of {formatNPR(h.budget_paisa)}</span>}
                  {h.over && ' (over)'}
                </span>
              </span>
              {used !== null && (
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={`block h-full rounded-full ${h.over ? 'bg-danger' : 'bg-bar'}`} style={{ width: `${Math.min(100, used)}%` }} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <Link className="mt-2 inline-block text-sm font-medium text-slate hover:underline" to={`/reports/budget-vs-cost?project=${projectId}`}>
        Budget vs recorded cost report
      </Link>
    </>
  )
}

/** Recorded cost split by where it came from. */
export function SourceList({ figures: f }: { figures: ProjectFigures }) {
  const s = f.by_source
  if (!s) return null
  const total = Number(f.cost_paisa) || 0
  const rows: Array<[string, number]> = [['Materials', s.materials], ['Subcontract', s.subcontract], ['Own labour', s.labour], ['Other expenses', s.other]]
  return (
    <ul>
      {rows.map(([label, n]) => (
        <li key={label} className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
          <span className="text-subtle">{label}</span>
          <span className="tabular-nums text-ink">{formatNPR(n)} <span className="text-xs text-subtle">{total ? percent(n, total) : ''}</span></span>
        </li>
      ))}
    </ul>
  )
}
