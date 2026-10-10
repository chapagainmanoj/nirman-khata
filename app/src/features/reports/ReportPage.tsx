// One report: filters kept in the URL (so a report can be shared or reopened), a table with
// totals, each row opening its source record, and export to Excel or print / PDF (req §18.3).
// The header says which date view it uses (req §19.1), so a printed copy explains itself.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { Button, EmptyState, ErrorBanner, Field, PageHeader, Select, Spinner } from '../../components/ui'
import { formatDate, formatDateTime, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { formatNPR } from '../../lib/money'
import { monthDays, monthOf } from '../../lib/months'
import { downloadXlsx } from '../../lib/xlsx'
import { PARTY } from '../parties/kinds'
import { useParties } from '../parties/api'
import { memberName, useMembers, useProjects } from '../projects/api'
import { useCurrentProject } from '../projects/current'
import { reportByKey, type Col, type Filters, visibleReports } from './defs'

const qtyText = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })

export function ReportPage() {
  const { reportKey = '' } = useParams()
  const auth = useCompany()
  const def = reportByKey(reportKey)
  const allowed = def && visibleReports(auth).includes(def)
  const [params, setParams] = useSearchParams()
  const current = useCurrentProject()
  const projects = useProjects(auth.companyId)
  const members = useMembers(auth.companyId)
  const parties = useParties(auth.companyId, def?.party ?? 'supplier')
  const [exporting, setExporting] = useState(false)
  const [openedAt] = useState(() => new Date().toISOString())

  const today = todayKathmandu()
  const thisMonth = monthDays(monthOf(today, auth.dateDisplay))
  const f: Filters = {
    from: params.get('from') ?? thisMonth[0],
    to: params.get('to') ?? today,
    asOf: params.get('asOf') ?? today,
    project: params.has('project') ? params.get('project') ?? '' : current.projectId ?? '',
    party: params.get('party') ?? '',
    asKnown: params.get('view') === 'known',
  }
  const set = (patch: Record<string, string>) => setParams({ ...Object.fromEntries(params), ...patch }, { replace: true })

  const ctx = {
    companyId: auth.companyId,
    dateDisplay: auth.dateDisplay,
    projects: (projects.data ?? []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    memberName: (id: string | null) => memberName(members.data, id),
  }
  const data = useQuery({
    queryKey: ['report', reportKey, f, ctx.projects.length],
    enabled: !!allowed && projects.isSuccess,
    queryFn: () => def!.load(f, ctx),
  })

  if (!def || !allowed) return <EmptyState title="Report not found">It does not exist or needs finance access. <Link className="text-brand" to="/reports">All reports</Link></EmptyState>

  // With one project chosen, the project column says the same thing on every row.
  const columns = def.columns.filter((c) => !(c.key === 'project' && f.project && def.key !== 'project-cost'))
  const rows = data.data?.rows ?? []
  const totals = columns.some((c) => c.total) && rows.length > 1
    ? columns.map((c) => (c.total ? rows.reduce((s, r) => s + (Number(r.values[c.key]) || 0), 0) : null))
    : null
  const show = (c: Col, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === '') return ''
    if (c.kind === 'money') return formatNPR(Number(v))
    if (c.kind === 'pct') return `${Number(v).toFixed(1).replace(/\.0$/, '')}%`
    if (c.kind === 'qty') return qtyText(Number(v))
    if (c.kind === 'date') return formatDate(String(v), auth.dateDisplay)
    return String(v)
  }
  const projectLabel = f.project ? ctx.projects.find((p) => p.id === f.project)?.name ?? '' : 'All projects'
  const partyLabel = f.party ? parties.data?.find((p) => p.id === f.party)?.name : null
  const notes = [
    def.period === 'range'
      ? `${formatDate(f.from, auth.dateDisplay)} to ${formatDate(f.to, auth.dateDisplay)}`
      : `As of ${formatDate(f.asOf, auth.dateDisplay)}${def.asKnown ? (f.asKnown ? ', as it was known on that date' : ', current view') : ''}`,
    projectLabel,
    ...(partyLabel ? [partyLabel] : []),
    ...(data.data?.note ? [data.data.note] : []),
  ]

  async function exportXlsx() {
    setExporting(true)
    try {
      const value = (c: Col, v: string | number | null | undefined) =>
        v === undefined || v === null ? null : c.kind === 'date' ? formatDate(String(v), auth.dateDisplay) : v
      await downloadXlsx(`${def!.key}-${f.asOf || f.to}.xlsx`, def!.title, [...notes, `Printed ${formatDateTime(new Date().toISOString(), auth.dateDisplay)}`],
        columns, rows.map((r) => columns.map((c) => value(c, r.values[c.key]))), totals ?? undefined)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      {/* On paper the report's own heading (company and title) replaces the screen header. */}
      <div className="print:hidden">
        <PageHeader title={def.title} crumbs={[{ to: '/reports', label: 'Reports' }]} subtitle={def.description}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" busy={exporting} disabled={!rows.length} onClick={() => void exportXlsx()}>Excel</Button>
              <Button variant="secondary" disabled={!rows.length} onClick={() => window.print()}>Print / PDF</Button>
            </div>
          } />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        {def.period === 'range' ? (
          <>
            <Field label="From" htmlFor="rp-from"><DateInput id="rp-from" value={f.from} onChange={(v) => set({ from: v })} display={auth.dateDisplay} quick="none" /></Field>
            <Field label="To" htmlFor="rp-to"><DateInput id="rp-to" value={f.to} onChange={(v) => set({ to: v })} display={auth.dateDisplay} /></Field>
          </>
        ) : (
          <Field label="As of" htmlFor="rp-asof"><DateInput id="rp-asof" value={f.asOf} onChange={(v) => set({ asOf: v })} display={auth.dateDisplay} /></Field>
        )}
        <Field label="Project" htmlFor="rp-project">
          <Select id="rp-project" value={f.project} onChange={(e) => set({ project: e.target.value })}>
            <option value="">All projects</option>
            {ctx.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        {def.party && (
          <Field label={PARTY[def.party].one} htmlFor="rp-party">
            <Select id="rp-party" value={f.party} onChange={(e) => set({ party: e.target.value })}>
              <option value="">{def.key.endsWith('ledger') ? `Choose ${PARTY[def.party].one.toLowerCase()}` : 'Any'}</option>
              {parties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        {def.asKnown && (
          <Field label="View" htmlFor="rp-view" hint="'As known' leaves out anything entered after the date">
            <Select id="rp-view" value={f.asKnown ? 'known' : 'current'} onChange={(e) => set({ view: e.target.value })}>
              <option value="current">Current (all entries dated up to then)</option>
              <option value="known">As known on that date</option>
            </Select>
          </Field>
        )}
      </div>

      <section aria-label="Report" className="rounded-xl border border-line bg-surface p-3 print:border-0 print:p-0">
        <div className="mb-2 hidden print:block">
          <h2 className="text-lg font-bold">{auth.company.name}: {def.title}</h2>
        </div>
        <p className="mb-2 text-sm text-subtle">{notes.join(' · ')}</p>
        {data.isPending && <Spinner />}
        <ErrorBanner onRetry={() => void data.refetch()}>{data.error && friendlyError(data.error)}</ErrorBanner>
        {data.data && rows.length === 0 && <p className="py-6 text-center text-sm text-subtle">Nothing for these filters.</p>}
        {rows.length > 0 && (
          <div className="-mx-3 overflow-x-auto px-3 print:overflow-visible">
            <table className="w-full min-w-[36rem] text-sm print:min-w-0">
              <thead>
                <tr className="border-b border-line text-left text-xs text-subtle">
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className={`py-2 pr-3 font-medium ${c.kind === 'text' || c.kind === 'date' ? '' : 'text-right'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line align-top last:border-0">
                    {columns.map((c, j) => {
                      const text = show(c, r.values[c.key])
                      const right = !(c.kind === 'text' || c.kind === 'date')
                      return (
                        <td key={c.key} className={`py-2 pr-3 ${right ? 'text-right tabular-nums' : ''} ${c.kind === 'date' ? 'whitespace-nowrap' : ''}`}>
                          {j === 0 && r.link ? <Link className="font-medium text-brand hover:underline print:text-ink" to={r.link}>{text || 'Open'}</Link> : text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-ink font-semibold">
                    {columns.map((c, j) => (
                      <td key={c.key} className={`py-2 pr-3 ${c.total ? 'text-right tabular-nums' : ''}`}>
                        {j === 0 ? 'Total' : c.total ? show(c, totals[j]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="mt-3 hidden text-xs print:block">Printed {formatDateTime(openedAt, auth.dateDisplay)} from NirmanKhata.</p>
      </section>
    </>
  )
}
