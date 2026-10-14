import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Field, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { addDays, formatDate, relativeDay, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { focusFirstError } from '../../lib/forms'
import { t } from '../../lib/i18n'
import { FULFILMENT, ROLE_LABELS, STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { supabase, type Tables } from '../../lib/supabase'
import { ExpenseSection, LabourSection, SubcontractSection } from '../costs/CostLists'
import { DeliveryList } from '../supply/DeliveryList'
import { useDeliveries, useDeliveryLineStatus, useOpenSlips, useProjectCost } from '../supply/api'
import { ClientTab } from '../clients/ClientTab'
import { useClientReceived } from '../clients/api'
import { useCalendarEvents } from '../site/api'
import { eventHref } from '../calendar/events'
import { BalanceText, Tabs } from '../parties/PartyParts'
import { canEnter, canPost } from '../supply/permissions'
import { memberName, useAmountsAsOf, useAssignments, useMembers, useProject, type Member } from './api'
import { ProjectDetailsFields } from './ProjectDetailsFields'
import { detailsSchema, detailsToRow, type DetailsValues } from './projectDetails'
import { RevisionsCard } from './RevisionsCard'
import { SiteSection } from '../site/SiteSection'
import { useProjectDashboard } from '../dashboard/api'
import { HeadingTable, SourceList, UsedBars, type ProjectFigures } from '../dashboard/parts'
import { ChevronDownIcon } from '../../components/icons'

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')
/** Rows per Activity list on the overview before "N more". */
const ACTIVITY_ROWS = 3
/** How far back "Recent" looks. */
const RECENT_DAYS = 30

type Tab = 'overview' | 'site' | 'deliveries' | 'subcontract' | 'labour' | 'client' | 'history' | 'details'

// Money first (spent, left of the budget), then contract and budget with where the money went,
// then today's work. Setup (details, staff) is rarely needed once a project runs, so it has its own tab.
// The long lists (site, deliveries, subcontract, labour) each get a tab so the page stays short.
export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const auth = useCompany()
  const project = useProject(projectId)
  const members = useMembers(auth.companyId)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'overview'

  if (project.isPending) return <Spinner />
  if (project.error) return <ErrorBanner onRetry={() => void project.refetch()}>{friendlyError(project.error)}</ErrorBanner>
  if (!project.data) {
    return <EmptyState title="Project not found">It does not exist or you are not assigned to it. <Link className="text-slate" to="/projects">Back to projects</Link></EmptyState>
  }
  const p = project.data
  const canEdit = auth.isAdmin || auth.hasRole('project_manager')
  const labourOn = auth.company.labour_module_enabled
  const tabs: Array<[Tab, string]> = [
    ['overview', 'Overview'], ['site', 'Site'], ['deliveries', 'Deliveries'], ['subcontract', 'Subcontract'],
    ['labour', labourOn ? 'Labour & costs' : 'Other costs'],
    ...(auth.canSeeFinance ? [['client', 'Client'], ['history', 'History']] as [Tab, string][] : []),
    ['details', 'Details'],
  ]
  const showDeliveries = () => setParams({ tab: 'deliveries' }, { replace: true })

  return (
    <>
      <PageHeader
        title={p.name}
        crumbs={[{ to: '/projects', label: 'Projects' }]}
        subtitle={<span className="flex items-center gap-2">{p.code} <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge></span>}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEnter(auth) && <ButtonLink to={`/daily/new?project=${p.id}`}>Daily report</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant="secondary" to={`/slips/new?project=${p.id}`}>New slip</ButtonLink>}
            <ButtonLink variant="ghost" to={`/calendar?project=${p.id}`}>Calendar</ButtonLink>
          </div>
        }
      />
      {auth.canSeeFinance && <SummaryStrip projectId={p.id} />}
      <Tabs tabs={tabs} value={tab} label="Project sections"
        onChange={(next) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })}>
        {tab === 'overview' && (
          <>
            <Activity project={p} canEdit={canEdit} onShowDeliveries={showDeliveries} />
            {auth.canSeeFinance && (
              <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
                <AmountsCard projectId={p.id} status={p.status} />
                <CostBreakdown projectId={p.id} />
              </div>
            )}
          </>
        )}
        {tab === 'site' && <SiteSection projectId={p.id} />}
        {tab === 'deliveries' && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-subtle">Record deliveries from the slip. Use this only for a purchase without one.</p>
              {canEnter(auth) && <ButtonLink variant="secondary" to={`/deliveries/new?project=${p.id}`}>Delivery without slip</ButtonLink>}
            </div>
            <DeliveryList filter={{ projectId: p.id }} />
          </section>
        )}
        {tab === 'subcontract' && <SubcontractSection projectId={p.id} />}
        {tab === 'labour' && (
          <>
            {labourOn && <LabourSection projectId={p.id} />}
            <ExpenseSection projectId={p.id} />
          </>
        )}
        {tab === 'client' && auth.canSeeFinance && <ClientTab projectId={p.id} clientName={p.client_name} />}
        {tab === 'history' && auth.canSeeFinance && <RevisionsCard projectId={p.id} members={members.data ?? []} />}
        {tab === 'details' && (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <DetailsCard project={p} members={members.data ?? []} canEdit={canEdit} />
            <TeamCard projectId={p.id} members={members.data ?? []} />
          </div>
        )}
      </Tabs>
    </>
  )
}

/** Cost by heading against the heading budget, and by source (req §18.2). */
function CostBreakdown({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const dash = useProjectDashboard(projectId)
  const d = dash.data
  if (dash.error) return <ErrorBanner onRetry={() => void dash.refetch()}>{friendlyError(dash.error)}</ErrorBanner>
  if (dash.isPending) return <Spinner />
  if (!d || !d.money_visible) return null
  return (
    <div className="flex flex-col gap-4">
      <Card title="Cost by heading"><HeadingTable figures={d} projectId={projectId} /></Card>
      <Card title="Where the money went">
        <SourceList figures={d} />
        {!!d.peski_paisa && <p className="mt-2 text-sm text-subtle">Peski not yet used: <span className="font-semibold text-ink">{formatNPR(d.peski_paisa)}</span></p>}
        {!!d.overpaid_paisa && <p className="mt-2 text-sm text-subtle">Overpaid, owed back: <span className="font-semibold text-ink">{formatNPR(d.overpaid_paisa)}</span></p>}
        <p className="mt-2 text-sm text-subtle">
          Last daily report: {d.last_report_date ? formatDate(d.last_report_date, auth.dateDisplay) : 'none yet'}
        </p>
      </Card>
    </div>
  )
}

/**
 * The two numbers a contractor looks for: what is spent (paid and still due) and what is left of
 * the spending budget. "Spent" counts entered bills and costs whether paid or not; what is not in
 * it yet (delivered but not billed, bills not posted) is listed under it with an estimate, never
 * added in, so the figure stays exact (req §19).
 */
function SummaryStrip({ projectId }: { projectId: string }) {
  const dash = useProjectDashboard(projectId)
  const f = dash.data
  if (dash.error) return <ErrorBanner onRetry={() => void dash.refetch()}>{friendlyError(dash.error)}</ErrorBanner>
  if (dash.isPending) return <Spinner />
  if (!f || !f.money_visible) return null
  const spent = Number(f.cost_paisa ?? 0)
  const budget = f.budget_paisa || null
  const left = budget === null ? null : budget - spent
  return (
    <section aria-label="Summary" className="rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-subtle">Spent</div>
          <div className="text-3xl font-semibold text-ink tabular-nums">{formatNPR(spent)}</div>
          <div className="mt-1 text-sm text-subtle">
            Paid <span className="font-semibold text-ink tabular-nums">{formatNPR(f.cash_paid_paisa)}</span>
            {' · '}Due <span className="font-semibold text-ink tabular-nums">{formatNPR(f.payable_paisa)}</span>
          </div>
        </div>
        <div>
          <div className={`text-sm font-medium ${left !== null && left < 0 ? 'text-danger' : 'text-subtle'}`}>
            {left !== null && left < 0 ? 'Over budget by' : 'Left'}
          </div>
          <div className={`text-3xl font-semibold tabular-nums ${left !== null && left < 0 ? 'text-danger' : 'text-ink'}`}>
            {left === null ? t('common.notAvailable') : formatNPR(Math.abs(left))}
          </div>
          <div className="mt-1 text-sm text-subtle">
            {budget === null ? 'No spending budget set' : <>of <span className="font-semibold text-ink tabular-nums">{formatNPR(budget)}</span> budget</>}
          </div>
        </div>
      </div>
      {/* Work done is entered on site, not worked out from cost (acceptance #10). */}
      <UsedBars figures={f} setProgress="?tab=site" />
      <NotSpentYet figures={f} />
    </section>
  )
}

/** Costs on their way that "Spent" does not count yet. What to do about them is in Activity. */
function NotSpentYet({ figures: f }: { figures: ProjectFigures }) {
  const items: string[] = []
  if (f.unbilled_lines > 0) {
    const what = `${f.unbilled_lines} delivered item${f.unbilled_lines === 1 ? '' : 's'} with no bill yet`
    items.push(f.unbilled_estimate_paisa
      ? `about ${formatNPR(f.unbilled_estimate_paisa)} for ${what}${f.unbilled_without_rate ? ' (some have no rate yet)' : ''}`
      : what)
  }
  if (f.draft_bills) {
    items.push(`${f.draft_bills_paisa ? `${formatNPR(f.draft_bills_paisa)} in ` : ''}${f.draft_bills} bill${f.draft_bills === 1 ? '' : 's'} not posted`)
  }
  if (!items.length) return null
  return <p className="mt-3 border-t border-line pt-2 text-sm text-subtle">Not in spent yet: {items.join(' · ')}</p>
}

/** A thing waiting on someone, with where to do it. */
type ToDo = { key: string; title: string; detail?: string; to?: string; onClick?: () => void }

/** How the Recent list names money: what it did to the project. */
const RECENT_MONEY: Record<string, string> = { cost: 'Cost', payment: 'Paid', peski: 'Peski', refund: 'Refund', received: 'Received' }
/** Routine steps that the calendar keeps but Recent leaves out. */
const RECENT_SKIP = new Set(['slip_sent'])

/**
 * What needs doing on this project, each with a link to do it, next to what happened lately
 * (the newest calendar events of any kind). People only see the to-dos they may act on.
 */
function Activity({ project: p, canEdit, onShowDeliveries }: { project: Tables<'projects'>; canEdit: boolean; onShowDeliveries: () => void }) {
  const auth = useCompany()
  const today = todayKathmandu()
  const slips = useOpenSlips({ companyId: auth.companyId, projectId: p.id })
  const deliveries = useDeliveries({ projectId: p.id })
  const unbilled = useDeliveryLineStatus({ projectId: p.id, billableOnly: true })
  const dash = useProjectDashboard(p.id)
  const events = useCalendarEvents(auth.companyId, addDays(today, -RECENT_DAYS), today, p.id)
  if (slips.isPending || events.isPending) return <Spinner />

  const f = dash.data
  const open = p.status !== 'completed' && p.status !== 'closed' && p.status !== 'cancelled'
  const waiting = slips.data ?? []
  const unbilledCount = unbilled.data?.length ?? 0
  const lateDays = open && p.planned_end && p.planned_end < today
    ? Math.round((Date.parse(today) - Date.parse(p.planned_end)) / 86_400_000) : 0
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  const todo: ToDo[] = []
  for (const s of waiting.slice(0, ACTIVITY_ROWS)) {
    const what = `${s.number} · ${s.suppliers?.name ?? ''} · ${FULFILMENT[s.fulfilment][0]}`
    todo.push(canEnter(auth)
      ? { key: `slip-${s.id}`, title: 'Record delivery', detail: what, to: `/deliveries/new?slip=${s.id}&project=${p.id}` }
      : { key: `slip-${s.id}`, title: 'Waiting for delivery', detail: what, to: `/slips/${s.id}` })
  }
  if (waiting.length > ACTIVITY_ROWS) {
    todo.push({ key: 'more-slips', title: `${plural(waiting.length - ACTIVITY_ROWS, 'more slip')} waiting`, to: '/slips' })
  }
  if (unbilledCount > 0 && canEnter(auth)) {
    const estimate = f?.money_visible && f.unbilled_estimate_paisa ? ` · about ${formatNPR(f.unbilled_estimate_paisa)}` : ''
    todo.push({ key: 'unbilled', title: 'Enter bills', detail: `${plural(unbilledCount, 'delivered item')}${estimate}`, onClick: onShowDeliveries })
  }
  if (f?.draft_bills && canPost(auth)) {
    todo.push({ key: 'drafts', title: 'Post bills', detail: `${plural(f.draft_bills, 'bill')} not posted${f.draft_bills_paisa ? ` · ${formatNPR(f.draft_bills_paisa)}` : ''}`, to: '/bills' })
  }
  if (canEdit && open && !p.actual_start && (deliveries.data?.length ?? 0) > 0) {
    todo.push({ key: 'start', title: 'Set actual start date', detail: 'deliveries are arriving', to: '?tab=details&edit=actual_start' })
  }
  if (canEdit && lateDays > 0) {
    todo.push({ key: 'late', title: 'Update planned completion', detail: `passed ${plural(lateDays, 'day')} ago`, to: '?tab=details&edit=planned_end' })
  }
  if (canEnter(auth) && p.status === 'active' && f && (f.days_since_report === null || f.days_since_report > 2)) {
    todo.push({ key: 'report', title: 'Send daily report', detail: f.days_since_report === null ? 'none yet' : `last one ${plural(f.days_since_report, 'day')} ago`, to: `/daily/new?project=${p.id}` })
  }

  const recent = (events.data ?? [])
    .filter((e) => !RECENT_SKIP.has(e.kind))
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, ACTIVITY_ROWS + 2)
  if (!todo.length && !recent.length) {
    return <p className="text-sm text-subtle">Nothing waiting, and nothing recorded in the last {RECENT_DAYS} days.</p>
  }
  const row = 'flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm hover:bg-muted'
  return (
    <Card title="Activity" actions={<ButtonLink variant="ghost" to={`/calendar?project=${p.id}`}>See all</ButtonLink>}>
      <div className={cx('grid grid-cols-1 gap-x-8 gap-y-3', todo.length > 0 && recent.length > 0 && 'lg:grid-cols-2')}>
        {todo.length > 0 && (
          <section className="min-w-0">
            <h3 className="text-xs font-medium text-subtle">To do · {todo.length}</h3>
            <ul>
              {todo.map((d) => {
                const body = (
                  <>
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-ink">{d.title}</span>
                      {d.detail && <span className="text-subtle"> · {d.detail}</span>}
                    </span>
                    <span aria-hidden className="shrink-0 text-brand">→</span>
                  </>
                )
                return (
                  <li key={d.key} className="border-b border-line last:border-0">
                    {d.to
                      ? <Link to={d.to} title={d.detail} className={row}>{body}</Link>
                      : <button type="button" title={d.detail} onClick={d.onClick} className={row}>{body}</button>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {recent.length > 0 && (
          <section className="min-w-0">
            <h3 className="text-xs font-medium text-subtle">Recent</h3>
            <ul>
              {recent.map((e, i) => {
                const to = eventHref(e)
                // Amounts come back only for people who may see money.
                const amount = e.cost_paisa || e.cash_paisa || e.received_paisa
                const tag = e.money ? RECENT_MONEY[e.money] : null
                // Who it was with and the full date go in the hover text, so the row never cuts them off.
                const more = [e.party_name, e.detail, formatDate(e.event_date, auth.dateDisplay)].filter(Boolean).join(' · ')
                const body = (
                  <>
                    <span className="min-w-0 truncate text-ink">{e.label}</span>
                    <span className="shrink-0 text-subtle tabular-nums">
                      {amount ? <>{tag && `${tag} `}<span className="font-medium text-ink">{formatNPR(Math.abs(amount))}</span> · </> : null}
                      {relativeDay(e.event_date, today)}
                    </span>
                  </>
                )
                return (
                  <li key={`${e.kind}-${e.link_id}-${i}`} className="border-b border-line last:border-0">
                    {to ? <Link to={to} title={more} className={row}>{body}</Link> : <div title={more} className={row}>{body}</div>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </Card>
  )
}

/** Fields a to-do may open the details form at. */
const EDIT_FIELDS = ['actual_start', 'planned_end'] as const

function DetailsCard({ project: p, members, canEdit }: { project: Tables<'projects'>; members: Member[]; canEdit: boolean }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  // Closing warns, never blocks (GLOSSARY: Closed): draft bills and money parties still hold here.
  const dash = useProjectDashboard(p.id)
  const [closeWarning, setCloseWarning] = useState<string[] | null>(null)
  const looseEnds = (() => {
    const f = dash.data
    if (!f) return []
    return [
      f.draft_bills ? `${f.draft_bills} draft bill${f.draft_bills === 1 ? '' : 's'} not posted` : '',
      f.peski_paisa ? `${formatNPR(f.peski_paisa)} peski not yet used` : '',
      f.overpaid_paisa ? `${formatNPR(f.overpaid_paisa)} overpaid, owed back` : '',
    ].filter(Boolean)
  })()
  function onSave(v: DetailsValues, confirmed = false) {
    if (!confirmed && v.status === 'closed' && p.status !== 'closed' && looseEnds.length) {
      setCloseWarning(looseEnds)
      return
    }
    setCloseWarning(null)
    save.mutate(v)
  }
  const [params, setParams] = useSearchParams()
  // A to-do opens the form at the field it is about: "?edit=actual_start".
  const focusField = EDIT_FIELDS.find((f) => f === params.get('edit'))
  const [editing, setEditingState] = useState(() => canEdit && !!focusField)
  const setEditing = (on: boolean) => {
    setEditingState(on)
    if (!on && params.has('edit')) setParams({ tab: 'details' }, { replace: true })
  }
  useEffect(() => {
    if (!editing || !focusField) return
    const el = document.getElementById(focusField)
    // In simple forms the date sits in a closed "More"; open it so the field can be seen.
    const fold = el?.closest('details')
    if (fold) fold.open = true
    el?.scrollIntoView({ block: 'center' })
    el?.focus({ preventScroll: true })
  }, [editing, focusField])
  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    shouldFocusError: false,
    values: {
      code: p.code, name: p.name, client_name: p.client_name ?? '', client_phone: p.client_phone ?? '',
      district: p.district ?? '', municipality: p.municipality ?? '', ward: p.ward ?? '', location_note: p.location_note ?? '',
      manager_id: p.manager_id ?? '', planned_start: p.planned_start ?? '', planned_end: p.planned_end ?? '',
      actual_start: p.actual_start ?? '', actual_end: p.actual_end ?? '', status: p.status,
    },
  })

  const save = useMutation({
    mutationFn: async (v: DetailsValues) => {
      const { data, error } = await supabase.from('projects').update(detailsToRow(v)).eq('id', p.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('You do not have permission to edit this project.')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', p.id] })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditing(false)
    },
  })

  if (editing) {
    return (
      <Card title={t('project.details')} className="lg:col-span-2">
        <form onSubmit={form.handleSubmit((v) => onSave(v), (errs, e) => focusFirstError(errs, e?.target as HTMLFormElement))} className="flex flex-col gap-4">
          <ProjectDetailsFields form={form} members={members} display={auth.dateDisplay} showActualDates />
          {closeWarning && (
            <Notice>
              <span className="block font-semibold">This project still has:</span>
              <ul className="list-disc pl-5">{closeWarning.map((w) => <li key={w}>{w}</li>)}</ul>
              <span className="block">You can close it anyway. Overpaid or peski money can still be moved to another project after reopening.</span>
              <Button type="button" variant="secondary" className="mt-2" onClick={() => onSave(form.getValues(), true)}>Close anyway</Button>
            </Notice>
          )}
          <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
          <div className="flex gap-2">
            <Button type="submit" busy={save.isPending}>{t('common.save')}</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          </div>
        </form>
      </Card>
    )
  }

  const d = auth.dateDisplay
  const empty = !p.client_name && !p.client_phone && !p.location_note && !p.ward && !p.municipality && !p.district
    && !p.manager_id && !p.planned_start && !p.planned_end && !p.actual_start && !p.actual_end
  return (
    <Card title={t('project.details')} actions={canEdit && <Button variant="ghost" onClick={() => setEditing(true)}>{t('common.edit')}</Button>}>
      {empty && <p className="text-sm text-subtle">No client, location or dates yet.</p>}
      <Detail label="Client">{[p.client_name, p.client_phone].filter(Boolean).join(' · ')}</Detail>
      <Detail label="Location">{[p.location_note, p.ward && `Ward ${p.ward}`, p.municipality, p.district].filter(Boolean).join(', ')}</Detail>
      <Detail label="Project manager">{memberName(members, p.manager_id)}</Detail>
      <Detail label="Planned start">{p.planned_start && <DateText value={p.planned_start} display={d} dual />}</Detail>
      <Detail label="Planned completion">{p.planned_end && <DateText value={p.planned_end} display={d} dual />}</Detail>
      <Detail label="Actual start">{p.actual_start && <DateText value={p.actual_start} display={d} dual />}</Detail>
      <Detail label="Actual completion">{p.actual_end && <DateText value={p.actual_end} display={d} dual />}</Detail>
    </Card>
  )
}

const OWED: Array<['supplier' | 'subcontractor' | 'crew' | 'payee', string]> = [
  ['supplier', 'Suppliers'], ['subcontractor', 'Subcontractors'], ['crew', 'Labour crews'], ['payee', 'Other payees'],
]

function AmountsCard({ projectId, status }: { projectId: string; status: Tables<'projects'>['status'] }) {
  const auth = useCompany()
  const [asOf, setAsOf] = useState(todayKathmandu())
  const [picking, setPicking] = useState(false)
  const amounts = useAmountsAsOf(projectId, asOf, true)
  const cost = useProjectCost(projectId, asOf, true)
  const received = useClientReceived(projectId, asOf, true)
  const a = amounts.data
  const c = cost.data
  const finished = status === 'completed' || status === 'closed'
  const budget = a?.budget_paisa || null
  const left = budget === null || !c ? null : budget - c.cost_paisa
  const changed = a && (a.contract_paisa !== a.original_contract_paisa || a.budget_paisa !== a.original_budget_paisa)

  return (
    <Card title={t('project.amounts')} actions={
      <Button variant="secondary" aria-expanded={picking} onClick={() => setPicking(!picking)}>
        As of {asOf === todayKathmandu() ? 'today' : formatDate(asOf, auth.dateDisplay)} <ChevronDownIcon size={16} className="inline" />
      </Button>
    }>
      {picking && (
        <div className="mb-3">
          <Field label="Show amounts as of" htmlFor="amounts-as-of">
            <DateInput id="amounts-as-of" value={asOf} onChange={(v) => v && setAsOf(v)} display={auth.dateDisplay} />
          </Field>
        </div>
      )}
      {(amounts.isPending || cost.isPending) && <Spinner />}
      <ErrorBanner onRetry={() => { void amounts.refetch(); void cost.refetch() }}>
        {(amounts.error || cost.error) && friendlyError(amounts.error || cost.error)}
      </ErrorBanner>
      {amounts.data !== undefined && c && (
        <>
          {/* The agreement first: what the client pays and what you plan to spend of it. */}
          <Detail label="Contract">{formatNPR(a?.contract_paisa)}</Detail>
          <Detail label="Spending budget">{budget === null ? t('common.notAvailable') : formatNPR(budget)}</Detail>
          <Detail label="Planned margin">{formatNPR(a?.planned_margin_paisa)}</Detail>
          {finished && a?.contract_paisa != null && (
            <Detail label={a.contract_paisa - c.cost_paisa >= 0 ? 'Final profit' : 'Final loss'}>
              {formatNPR(Math.abs(a.contract_paisa - c.cost_paisa))}
            </Detail>
          )}
          {received.data !== undefined && a?.contract_paisa != null && (
            <>
              <h3 className="mt-4 flex items-baseline justify-between gap-2 text-sm font-medium text-subtle">
                From the client
                <Link to="?tab=client" className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium text-brand underline underline-offset-4">See receipts</Link>
              </h3>
              <Detail label="Received">{formatNPR(received.data)}</Detail>
              <Detail label={a.contract_paisa - received.data < 0 ? 'Received more than contract by' : 'To collect'}>
                {formatNPR(Math.abs(a.contract_paisa - received.data))}
              </Detail>
            </>
          )}
          <h3 className="mt-4 text-sm font-medium text-subtle">Against the budget</h3>
          <Detail label="Spent">{formatNPR(c.cost_paisa)}</Detail>
          <Detail label={left !== null && left < 0 ? 'Over budget by' : 'Left'}>
            {left === null ? t('common.notAvailable') : formatNPR(Math.abs(left))}
          </Detail>
          <Detail label="Paid">{formatNPR(c.cash_paid_paisa)}</Detail>
          <Detail label="Due">{formatNPR(c.payable_paisa)}</Detail>
          {/* Break it down only when more than one kind of party is owed; one kind would just repeat the total. */}
          {OWED.filter(([k]) => c.payable_by_kind[k] !== 0).length > 1 && OWED.map(([k, label]) => c.payable_by_kind[k] !== 0 && (
            <Detail key={k} label={`· ${label}`}><BalanceText paisa={c.payable_by_kind[k]} /></Detail>
          ))}
          <p className="mt-3 text-xs text-subtle">
            {changed
              ? <>Started at contract {formatNPR(a?.original_contract_paisa)}, budget {formatNPR(a?.original_budget_paisa)}. <Link to="?tab=history" className="font-medium text-brand underline underline-offset-4">See changes</Link></>
              : 'No changes to the contract or budget since the start.'}
            {!finished && ' Profit is shown only after the project is completed or closed.'}
          </p>
        </>
      )}
    </Card>
  )
}

function TeamCard({ projectId, members }: { projectId: string; members: Member[] }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const assignments = useAssignments(projectId)
  const [adding, setAdding] = useState('')
  const assigned = new Set(assignments.data?.map((a) => a.user_id))
  // Admin and Accounts see every project, so assigning them is not needed.
  const assignable = members.filter(
    (m) => m.active && !assigned.has(m.user_id) && !m.roles.includes('admin') && !m.roles.includes('accounts'),
  )

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['assignments', projectId] })
  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('project_assignments').insert({ company_id: auth.companyId, project_id: projectId, user_id: userId })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding('')
      return refresh()
    },
  })
  const remove = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('project_assignments').delete().eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: refresh,
  })

  return (
    <Card title={t('project.team')}>
      <p className="mb-2 text-xs text-subtle">Admins and Accounts staff can see all projects without being assigned.</p>
      {assignments.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void assignments.refetch()}>{assignments.error && friendlyError(assignments.error)}</ErrorBanner>
      {assignments.data?.length === 0 && <p className="text-sm text-subtle">Nobody is assigned yet.</p>}
      <ul>
        {assignments.data?.map((a) => {
          const m = members.find((x) => x.user_id === a.user_id)
          const name = m?.profiles?.full_name ?? 'Former staff'
          return (
            <li key={a.id} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0 break-words">
                <div className="text-sm font-medium text-ink">{name}</div>
                <div className="text-xs text-subtle">{m?.roles.map((r) => ROLE_LABELS[r]).join(', ')}{m && !m.active && ' · inactive'}</div>
              </div>
              {auth.isAdmin && (
                <ConfirmButton label={`Remove ${name}`} confirmLabel="Yes, remove" disabled={remove.isPending}
                  onConfirm={() => remove.mutate(a.id)}>
                  Remove
                </ConfirmButton>
              )}
            </li>
          )
        })}
      </ul>
      {auth.isAdmin && assignable.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Select aria-label="Staff to assign" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Choose staff to assign</option>
            {assignable.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>
            ))}
          </Select>
          <Button disabled={!adding} busy={add.isPending} onClick={() => add.mutate(adding)}>Assign</Button>
        </div>
      )}
      <ErrorBanner>{(add.error || remove.error) && friendlyError(add.error || remove.error)}</ErrorBanner>
    </Card>
  )
}
