import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Field, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { addDays, formatDate, relativeDay, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { focusFirstError } from '../../lib/forms'
import { t, type MessageKey } from '../../lib/i18n'
import { FULFILMENT, ROLE_LABELS, STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR } from '../../lib/money'
import { supabase, type Tables } from '../../lib/supabase'
import { openBy, useOpenLabour } from '../labour/api'
import { ExpenseSection, LabourSection, SubcontractSection } from '../costs/CostLists'
import { DeliveryList } from '../supply/DeliveryList'
import { useDeliveries, useDeliveryLineStatus, useOpenSlips, useProjectCost } from '../supply/api'
import { ClientTab } from '../clients/ClientTab'
import { useClientReceived } from '../clients/api'
import { useCalendarEvents } from '../site/api'
import { eventHref } from '../calendar/events'
import { BalanceText, DeleteUnused } from '../parties/PartyParts'
import { Tabs } from '../../components/Tabs'
import { canEnter, canPost } from '../../data/permissions'
import { memberName, useAmountsAsOf, useAssignments, useMembers, useProject, type Member } from './api'
import { ProjectDetailsFields } from './ProjectDetailsFields'
import { detailsSchema, detailsToRow, type DetailsValues } from './projectDetails'
import { RevisionsCard } from './RevisionsCard'
import { SiteSection } from '../site/SiteSection'
import { useProjectDashboard } from '../dashboard/api'
import { SourceList, UsedBars, type ProjectFigures } from '../dashboard/parts'
import { ChevronDownIcon } from '../../components/icons'
import { refresh } from '../../data/refresh'

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')
/** Rows per Activity list on the overview before "N more". */
const ACTIVITY_ROWS = 3
/** How far back "Recent" looks. */
const RECENT_DAYS = 30

type Tab = 'overview' | 'activity' | 'deliveries' | 'subcontract' | 'labour' | 'client' | 'details'

// Money first (spent, left of the budget), then contract and budget with where the money went;
// today's work (to do, recent) has its own Activity tab beside it. Project details holds progress and daily reports, then the setup (details,
// staff) that is rarely needed once a project runs. The long lists (deliveries, subcontract,
// labour) each get a tab so the page stays short.
export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const auth = useCompany()
  const project = useProject(projectId)
  const members = useMembers(auth.companyId)

  if (project.isPending) return <Spinner />
  if (project.error) return <ErrorBanner onRetry={() => void project.refetch()}>{friendlyError(project.error)}</ErrorBanner>
  if (!project.data) {
    return <EmptyState title={t('projectDetail.projectNotFound')}>{t('projectDetail.itDoesNotExist')}{' '}<Link className="text-slate" to="/projects">{t('projectDetail.backToProjects')}</Link></EmptyState>
  }
  return <ProjectBody p={project.data} members={members} />
}

/** The loaded project: header, money strip and tabs. */
function ProjectBody({ p, members }: { p: Tables<'projects'>; members: ReturnType<typeof useMembers> }) {
  const auth = useCompany()
  const [params, setParams] = useSearchParams()
  // Site (progress, daily reports) and History (contract and budget changes) are part of Project
  // details; "?tab=site" and "?tab=history" links land there, the second scrolled to the changes.
  // Overview is money (contract, budget, cost); without it a project opens on Activity.
  const first: Tab = auth.canSeeFinance ? 'overview' : 'activity'
  const asked = params.get('tab') as Tab | 'site' | 'history' | null
  const tab: Tab = asked === 'site' || asked === 'history' ? 'details' : asked === 'overview' && !auth.canSeeFinance ? first : asked ?? first

  const canEdit = auth.isAdmin || auth.hasRole('project_manager')
  const labourOn = auth.company.labour_module_enabled
  const showDeliveries = () => setParams({ tab: 'deliveries' }, { replace: true })
  const { todo, isPending: todoPending } = useProjectTodo(p, canEdit, showDeliveries)
  const tabs: Array<[Tab, string]> = [
    ...(auth.canSeeFinance ? [['overview', t('projectDetail.overview')]] as [Tab, string][] : []),
    // The count keeps the to-dos in sight now that they are not on the first tab.
    ['activity', todo.length ? t('projectDetail.activityLength', { length: todo.length }) : t('projectDetail.activity')], ['deliveries', t('projectDetail.deliveries')], ['subcontract', t('projectDetail.subcontract')],
    ['labour', labourOn ? t('projectDetail.labourCosts') : t('projectDetail.otherCosts')],
    ...(auth.canSeeFinance ? [['client', t('projectDetail.client')]] as [Tab, string][] : []),
    ['details', t('projectDetail.projectDetails')],
  ]

  return (
    <>
      <PageHeader
        title={p.name}
        crumbs={[{ to: '/projects', label: t('projectDetail.projects') }]}
        subtitle={<span className="flex items-center gap-2">{p.code} <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge></span>}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEnter(auth) && <ButtonLink to={`/slips/new?project=${p.id}`}>{t('projectDetail.newOrderSlip')}</ButtonLink>}
            {canEnter(auth) && <ButtonLink variant="secondary" to={`/daily/new?project=${p.id}`}>{t('projectDetail.dailyReport')}</ButtonLink>}
            <ButtonLink variant="ghost" to={`/calendar?project=${p.id}`}>{t('projectDetail.calendar')}</ButtonLink>
          </div>
        }
      />
      {auth.canSeeFinance && <SummaryStrip projectId={p.id} />}
      <Tabs tabs={tabs} value={tab} label={t('projectDetail.projectSections')} soft
        onChange={(next) => setParams(next === first ? {} : { tab: next }, { replace: true })}>
        {tab === 'overview' && auth.canSeeFinance && (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <AmountsCard projectId={p.id} status={p.status} />
            <CostBreakdown projectId={p.id} />
          </div>
        )}
        {tab === 'activity' && (todoPending ? <Spinner /> : <Activity project={p} todo={todo} />)}
        {tab === 'deliveries' && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-subtle">{t('projectDetail.recordDeliveriesFromThe')}</p>
              {canEnter(auth) && <ButtonLink variant="secondary" to={`/deliveries/new?project=${p.id}`}>{t('projectDetail.deliveryWithoutOrderSlip')}</ButtonLink>}
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
        {tab === 'details' && (
          <div className="flex flex-col gap-4">
            {/* Progress first: "Set progress" and "Update progress" links land here. */}
            <SiteSection projectId={p.id} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <DetailsCard project={p} members={members.data ?? []} canEdit={canEdit} />
              <TeamCard projectId={p.id} members={members.data ?? []} />
            </div>
            {auth.canSeeFinance && <RevisionsCard projectId={p.id} members={members.data ?? []} scrollTo={asked === 'history'} />}
          </div>
        )}
      </Tabs>
    </>
  )
}

/** Recorded cost by source, with the cost-by-heading report one tap away (req §18.2). Headings
 *  over their budget are flagged on the dashboard (attention.ts). */
function CostBreakdown({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const dash = useProjectDashboard(projectId)
  const d = dash.data
  if (dash.error) return <ErrorBanner onRetry={() => void dash.refetch()}>{friendlyError(dash.error)}</ErrorBanner>
  if (dash.isPending) return <Spinner />
  if (!d || !d.money_visible) return null
  return (
    <div className="flex flex-col gap-4">
      <Card title={t('projectDetail.whereTheMoneyWent')}>
        <SourceList figures={d} />
        {!!d.peski_paisa && <p className="mt-2 text-sm text-subtle">{t('projectDetail.peskiNotYetUsed')}{' '}<span className="font-semibold text-ink">{formatNPR(d.peski_paisa)}</span></p>}
        {!!d.overpaid_paisa && <p className="mt-2 text-sm text-subtle">{t('projectDetail.overpaidOwedBack')}{' '}<span className="font-semibold text-ink">{formatNPR(d.overpaid_paisa)}</span></p>}
        <p className="mt-2 text-sm text-subtle">
          {t('projectDetail.lastDailyReport')}{' '}{d.last_report_date ? formatDate(d.last_report_date, auth.dateDisplay) : t('projectDetail.noneYet')}
        </p>
        <Link className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-slate hover:underline" to={`/reports/cost-by-heading?project=${projectId}`}>
          {t('projectDetail.costByHeadingReport')}</Link>
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
  const auth = useCompany()
  const dash = useProjectDashboard(projectId)
  const openLabour = useOpenLabour(auth.companyId, auth.company.labour_mode === 'attendance')
  const labour = openBy(openLabour.data, 'project_id').get(projectId)
  const f = dash.data
  if (dash.error) return <ErrorBanner onRetry={() => void dash.refetch()}>{friendlyError(dash.error)}</ErrorBanner>
  if (dash.isPending) return <Spinner />
  if (!f || !f.money_visible) return null
  const spent = Number(f.cost_paisa ?? 0)
  // Due is net of what parties hold (peski, overpaid); shown apart, so it never goes below zero.
  const held = (f.peski_paisa ?? 0) + (f.overpaid_paisa ?? 0)
  const due = (f.payable_paisa ?? 0) + held
  const budget = f.budget_paisa || null
  const left = budget === null ? null : budget - spent
  return (
    <section aria-label={t('projectDetail.summary')} className="rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-subtle">{t('projectDetail.costSoFar')}</div>
          <div className="text-3xl font-semibold text-ink tabular-nums">{formatNPR(spent)}</div>
          <div className="mt-1 text-sm text-subtle">
            {t('projectDetail.paid')}{' '}<span className="font-semibold text-ink tabular-nums">{formatNPR(f.cash_paid_paisa)}</span>
            {t('projectDetail.valueDue', { value: ' · ' })}{' '}<span className="font-semibold text-ink tabular-nums">{formatNPR(due)}</span>
            {held > 0 && <>{t('projectDetail.valueTheyHold', { value: ' · ' })}{' '}<span className="font-semibold text-good-ink tabular-nums">{formatNPR(held)}</span></>}
          </div>
        </div>
        <div>
          <div className={`text-sm font-medium ${left !== null && left < 0 ? 'text-danger' : 'text-subtle'}`}>
            {left !== null && left < 0 ? t('projectDetail.overBudgetBy') : t('projectDetail.left')}
          </div>
          <div className={`text-3xl font-semibold tabular-nums ${left !== null && left < 0 ? 'text-danger' : 'text-ink'}`}>
            {left === null ? t('common.notAvailable') : formatNPR(Math.abs(left))}
          </div>
          <div className="mt-1 text-sm text-subtle">
            {budget === null ? t('projectDetail.noSpendingBudgetSet') : <>{t('projectDetail.of')}{' '}<span className="font-semibold text-ink tabular-nums">{formatNPR(budget)}</span> {t('projectDetail.budget')}</>}
          </div>
        </div>
      </div>
      {/* Work done is entered on site, not worked out from cost (acceptance #10). */}
      <UsedBars figures={f} setProgress="?tab=site" />
      <NotSpentYet figures={f} labour={labour} />
    </section>
  )
}

/** Costs on their way that "Spent" does not count yet. What to do about them is in Activity. */
function NotSpentYet({ figures: f, labour }: { figures: ProjectFigures; labour?: { days: number } }) {
  const items: string[] = []
  // Attendance days still drafts: no money until verified (GLOSSARY: Attendance).
  if (labour?.days) items.push(t(labour.days === 1 ? 'projectDetail.daysNotVerified.one' : 'projectDetail.daysNotVerified.many', { n: labour.days }))
  if (f.unbilled_lines > 0) {
    const what = t(f.unbilled_lines === 1 ? 'projectDetail.noBillYet.one' : 'projectDetail.noBillYet.many', { n: f.unbilled_lines })
    items.push(f.unbilled_estimate_paisa
      ? `${t('projectDetail.aboutFor', { amount: formatNPR(f.unbilled_estimate_paisa), what })}${f.unbilled_without_rate ? t('projectDetail.someHaveNoRate') : ''}`
      : what)
  }
  if (f.draft_bills) {
    items.push(`${f.draft_bills_paisa ? t('projectDetail.draftbillsIn', { draftBills: formatNPR(f.draft_bills_paisa) }) : ''}${t(f.draft_bills === 1 ? 'projectDetail.billsNotPosted.one' : 'projectDetail.billsNotPosted.many', { n: f.draft_bills })}`)
  }
  if (!items.length) return null
  return <p className="mt-3 border-t border-line pt-2 text-sm text-subtle">{t('projectDetail.notInSpentYet', { value: items.join(' · ') })}</p>
}

/** A thing waiting on someone, with where to do it. */
type ToDo = { key: string; title: string; detail?: string; to?: string; onClick?: () => void }

/** How the Recent list names money: what it did to the project. */
const RECENT_MONEY: Record<string, MessageKey | undefined> = {
  cost: 'projectDetail.money.cost', payment: 'projectDetail.money.payment', peski: 'projectDetail.money.peski',
  refund: 'projectDetail.money.refund', received: 'projectDetail.money.received',
}
/** Routine steps that the calendar keeps but Recent leaves out. */
const RECENT_SKIP = new Set(['slip_sent'])

/** What needs doing on this project, each with where to do it. People only see the to-dos they may act on. */
function useProjectTodo(p: Tables<'projects'>, canEdit: boolean, onShowDeliveries: () => void): { todo: ToDo[]; isPending: boolean } {
  const auth = useCompany()
  const today = todayKathmandu()
  const slips = useOpenSlips({ companyId: auth.companyId, projectId: p.id })
  const deliveries = useDeliveries({ projectId: p.id })
  const unbilled = useDeliveryLineStatus({ projectId: p.id, billableOnly: true })
  const dash = useProjectDashboard(p.id)
  const openLabour = useOpenLabour(auth.companyId, auth.company.labour_mode === 'attendance')
  const labourDays = openBy(openLabour.data, 'project_id').get(p.id)?.days ?? 0

  const f = dash.data
  const open = p.status !== 'completed' && p.status !== 'closed' && p.status !== 'cancelled'
  const waiting = slips.data ?? []
  const unbilledCount = unbilled.data?.length ?? 0
  const lateDays = open && p.planned_end && p.planned_end < today
    ? Math.round((Date.parse(today) - Date.parse(p.planned_end)) / 86_400_000) : 0
  const plural = (n: number, one: MessageKey, many: MessageKey) => t(n === 1 ? one : many, { n })

  const todo: ToDo[] = []
  for (const s of waiting.slice(0, ACTIVITY_ROWS)) {
    const what = `${s.number} · ${s.suppliers?.name ?? ''} · ${FULFILMENT[s.fulfilment][0]}`
    todo.push(canEnter(auth)
      ? { key: `slip-${s.id}`, title: t('projectDetail.recordDelivery'), detail: what, to: `/deliveries/new?slip=${s.id}&project=${p.id}` }
      : { key: `slip-${s.id}`, title: t('projectDetail.waitingForDelivery'), detail: what, to: `/slips/${s.id}` })
  }
  if (waiting.length > ACTIVITY_ROWS) {
    todo.push({ key: 'more-slips', title: plural(waiting.length - ACTIVITY_ROWS, 'projectDetail.moreSlipsWaiting.one', 'projectDetail.moreSlipsWaiting.many'), to: '/slips' })
  }
  if (unbilledCount > 0 && canEnter(auth)) {
    const estimate = f?.money_visible && f.unbilled_estimate_paisa ? ` · ${t('projectDetail.aboutAmount', { amount: formatNPR(f.unbilled_estimate_paisa) })}` : ''
    todo.push({ key: 'unbilled', title: t('projectDetail.enterBills'), detail: `${plural(unbilledCount, 'projectDetail.deliveredItems.one', 'projectDetail.deliveredItems.many')}${estimate}`, onClick: onShowDeliveries })
  }
  if (f?.draft_bills && canPost(auth)) {
    todo.push({ key: 'drafts', title: t('projectDetail.postBills'), detail: `${plural(f.draft_bills, 'projectDetail.billsNotPosted.one', 'projectDetail.billsNotPosted.many')}${f.draft_bills_paisa ? ` · ${formatNPR(f.draft_bills_paisa)}` : ''}`, to: '/bills' })
  }
  if (labourDays > 0 && canEnter(auth)) {
    todo.push({ key: 'labour', title: t('projectDetail.verifyAttendance'), detail: plural(labourDays, 'projectDetail.daysStillDrafts.one', 'projectDetail.daysStillDrafts.many'), to: `/labour/crew?project=${p.id}` })
  }
  if (canEdit && open && !p.actual_start && (deliveries.data?.length ?? 0) > 0) {
    todo.push({ key: 'start', title: t('projectDetail.setActualStartDate'), detail: t('projectDetail.deliveriesArriving'), to: '?tab=details&edit=actual_start' })
  }
  if (canEdit && lateDays > 0) {
    todo.push({ key: 'late', title: t('projectDetail.updatePlannedCompletion'), detail: plural(lateDays, 'projectDetail.passedDaysAgo.one', 'projectDetail.passedDaysAgo.many'), to: '?tab=details&edit=planned_end' })
  }
  if (canEnter(auth) && p.status === 'active' && f && (f.days_since_report === null || f.days_since_report > 2)) {
    todo.push({ key: 'report', title: t('projectDetail.sendDailyReport'), detail: f.days_since_report === null ? t('projectDetail.noneYet') : plural(f.days_since_report, 'projectDetail.lastOneDaysAgo.one', 'projectDetail.lastOneDaysAgo.many'), to: `/daily/new?project=${p.id}` })
  }
  return { todo, isPending: slips.isPending }
}

/** The to-do list next to what happened lately (the newest calendar events of any kind). */
function Activity({ project: p, todo }: { project: Tables<'projects'>; todo: ToDo[] }) {
  const auth = useCompany()
  const today = todayKathmandu()
  const events = useCalendarEvents(auth.companyId, addDays(today, -RECENT_DAYS), today, p.id)
  if (events.isPending) return <Spinner />

  const recent = (events.data ?? [])
    .filter((e) => !RECENT_SKIP.has(e.kind))
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || (b.at ?? '').localeCompare(a.at ?? ''))
    // As many as the to-do list beside it (3 to 5), so neither column leaves a gap; 5 when alone.
    .slice(0, todo.length ? Math.min(Math.max(ACTIVITY_ROWS, todo.length), ACTIVITY_ROWS + 2) : ACTIVITY_ROWS + 2)
  if (!todo.length && !recent.length) {
    return <p className="text-sm text-subtle">{t('projectDetail.nothingWaitingAndNothing', { recentDays: RECENT_DAYS })}</p>
  }
  // Touch screens keep 44px rows; with a mouse the rows are tighter.
  const row = 'flex min-h-11 [@media(pointer:fine)]:min-h-9 w-full items-center justify-between gap-3 text-left text-sm hover:bg-muted'
  return (
    <Card title={t('projectDetail.activity')} actions={<ButtonLink variant="ghost" to={`/calendar?project=${p.id}`}>{t('projectDetail.seeAll')}</ButtonLink>}>
      <div className={cx('grid grid-cols-1 gap-x-8 gap-y-3', todo.length > 0 && recent.length > 0 && 'lg:grid-cols-2')}>
        {todo.length > 0 && (
          <section className="min-w-0">
            <h3 className="text-xs font-medium text-subtle">{t('projectDetail.toDoLength', { length: todo.length })}</h3>
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
            <h3 className="text-xs font-medium text-subtle">{t('projectDetail.recent')}</h3>
            <ul>
              {recent.map((e, i) => {
                const to = eventHref(e)
                // Amounts come back only for people who may see money.
                const amount = e.cost_paisa || e.cash_paisa || e.received_paisa
                const tagKey = e.money ? RECENT_MONEY[e.money] : undefined
                const tag = tagKey ? t(tagKey) : null
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
  const navigate = useNavigate()
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
      if (!data?.length) throw new Error(t('projectDetail.youDoNotHave'))
    },
    onSuccess: async () => {
      await refresh(queryClient, 'projects')
      setEditing(false)
    },
  })

  if (editing) {
    return (
      <div className="lg:col-span-2">
      <Card title={t('project.details')}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v), (errs, e) => focusFirstError(errs, e?.target as HTMLFormElement))} className="flex flex-col gap-4">
          <ProjectDetailsFields form={form} members={members} display={auth.dateDisplay} showActualDates />
          <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
          <div className="flex gap-2">
            <Button type="submit" busy={save.isPending}>{t('common.save')}</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          </div>
        </form>
      </Card>
      <DeleteUnused kind="project" id={p.id} name={p.name} onDeleted={() => navigate('/projects', { replace: true })} />
      </div>
    )
  }

  const d = auth.dateDisplay
  const empty = !p.client_name && !p.client_phone && !p.location_note && !p.ward && !p.municipality && !p.district
    && !p.manager_id && !p.planned_start && !p.planned_end && !p.actual_start && !p.actual_end
  return (
    <Card title={t('project.details')} actions={canEdit && <Button variant="ghost" onClick={() => setEditing(true)}>{t('common.edit')}</Button>}>
      {empty && <p className="text-sm text-subtle">{t('projectDetail.noClientLocationOr')}</p>}
      <Detail label={t('projectDetail.client')}>{[p.client_name, p.client_phone].filter(Boolean).join(' · ')}</Detail>
      <Detail label={t('projectDetail.location')}>{[p.location_note, p.ward && t('projectDetail.wardWard', { ward: p.ward }), p.municipality, p.district].filter(Boolean).join(', ')}</Detail>
      <Detail label={t('projectDetail.projectManager')}>{memberName(members, p.manager_id)}</Detail>
      <Detail label={t('projectDetail.plannedStart')}>{p.planned_start && <DateText value={p.planned_start} display={d} dual />}</Detail>
      <Detail label={t('projectDetail.plannedCompletion')}>{p.planned_end && <DateText value={p.planned_end} display={d} dual />}</Detail>
      <Detail label={t('projectDetail.actualStart')}>{p.actual_start && <DateText value={p.actual_start} display={d} dual />}</Detail>
      <Detail label={t('projectDetail.actualCompletion')}>{p.actual_end && <DateText value={p.actual_end} display={d} dual />}</Detail>
      {canEdit && <StatusActions project={p} />}
    </Card>
  )
}

/**
 * The two status steps kept out of the status list (GLOSSARY: Project status): "Close books" on a
 * Completed project (no new bills or payments until reopened) and "Cancel project" for one that
 * never went ahead. Both can be undone. Closing warns, never blocks (GLOSSARY: Closed): draft
 * bills and money with parties may still sit on the project.
 */
function StatusActions({ project: p }: { project: Tables<'projects'> }) {
  const queryClient = useQueryClient()
  const dash = useProjectDashboard(p.id)
  const [closing, setClosing] = useState(false)
  const setStatus = useMutation({
    mutationFn: async (status: Tables<'projects'>['status']) => {
      const { data, error } = await supabase.from('projects').update({ status }).eq('id', p.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error(t('projectDetail.youDoNotHave2'))
    },
    onSuccess: async () => {
      setClosing(false)
      await refresh(queryClient, 'projects')
    },
  })
  const f = dash.data
  const looseEnds = f ? [
    f.draft_bills ? t(f.draft_bills === 1 ? 'projectDetail.draftBillsNotPosted.one' : 'projectDetail.draftBillsNotPosted.many', { n: f.draft_bills }) : '',
    f.peski_paisa ? t('projectDetail.peskiPeskiNotYet', { peski: formatNPR(f.peski_paisa) }) : '',
    f.overpaid_paisa ? t('projectDetail.overpaidOverpaidOwedBack', { overpaid: formatNPR(f.overpaid_paisa) }) : '',
  ].filter(Boolean) : []

  const note = 'mt-4 border-t border-line pt-3'
  const error = <ErrorBanner>{setStatus.error && friendlyError(setStatus.error)}</ErrorBanner>
  if (p.status === 'completed') {
    return (
      <div className={note}>
        <p className="text-sm text-subtle">{t('projectDetail.workIsDoneFinal')}</p>
        {closing ? (
          <Notice>
            {looseEnds.length > 0 && (
              <>
                <span className="block font-semibold">{t('projectDetail.thisProjectStillHas')}</span>
                <ul className="list-disc pl-5">{looseEnds.map((w) => <li key={w}>{w}</li>)}</ul>
              </>
            )}
            <span className="block">{t('projectDetail.noNewBillsCosts')}{looseEnds.length > 0 && t('projectDetail.overpaidOrPeskiMoney')}</span>
            <span className="mt-2 flex gap-2">
              <Button type="button" busy={setStatus.isPending} onClick={() => setStatus.mutate('closed')}>{looseEnds.length ? t('projectDetail.closeAnyway') : t('projectDetail.closeBooks')}</Button>
              <Button type="button" variant="secondary" onClick={() => setClosing(false)}>{t('common.cancel')}</Button>
            </span>
          </Notice>
        ) : (
          <Button type="button" variant="secondary" className="mt-2" onClick={() => setClosing(true)}>{t('projectDetail.closeBooks')}</Button>
        )}
        {error}
      </div>
    )
  }
  if (p.status === 'closed') {
    return (
      <div className={note}>
        <p className="text-sm text-subtle">{t('projectDetail.booksClosedNoNew')}</p>
        <Button type="button" variant="secondary" className="mt-2" busy={setStatus.isPending} onClick={() => setStatus.mutate('completed')}>{t('projectDetail.reopenBooks')}</Button>
        {error}
      </div>
    )
  }
  if (p.status === 'cancelled') {
    return (
      <div className={note}>
        <p className="text-sm text-subtle">{t('projectDetail.cancelledLeftOutOf')}</p>
        <Button type="button" variant="secondary" className="mt-2" busy={setStatus.isPending} onClick={() => setStatus.mutate('active')}>{t('projectDetail.restoreProject')}</Button>
        {error}
      </div>
    )
  }
  return (
    <div className={note}>
      <ConfirmButton confirmLabel={t('projectDetail.yesCancelProject')} disabled={setStatus.isPending} onConfirm={() => setStatus.mutate('cancelled')}>
        {t('projectDetail.cancelProject')}</ConfirmButton>
      <p className="mt-1 text-xs text-subtle">{t('projectDetail.forAProjectThat')}</p>
      {error}
    </div>
  )
}

const OWED: Array<['supplier' | 'subcontractor' | 'crew' | 'payee', MessageKey]> = [
  ['supplier', 'projectDetail.owed.supplier'], ['subcontractor', 'projectDetail.owed.subcontractor'], ['crew', 'projectDetail.owed.crew'], ['payee', 'projectDetail.owed.payee'],
]

function AmountsCard({ projectId, status }: { projectId: string; status: Tables<'projects'>['status'] }) {
  const auth = useCompany()
  const [asOf, setAsOf] = useState(todayKathmandu())
  const [picking, setPicking] = useState(false)
  const amounts = useAmountsAsOf(projectId, asOf, true)
  const cost = useProjectCost(projectId, asOf, true)
  const received = useClientReceived(projectId, asOf, true)
  // What parties hold here (peski, overpaid), per party: Due is shown without it, never negative.
  const figures = useProjectDashboard(projectId, asOf === todayKathmandu() ? undefined : asOf)
  const held = (figures.data?.peski_paisa ?? 0) + (figures.data?.overpaid_paisa ?? 0)
  const a = amounts.data
  const c = cost.data
  const finished = status === 'completed' || status === 'closed'
  const budget = a?.budget_paisa || null
  const left = budget === null || !c ? null : budget - c.cost_paisa
  const changed = a && (a.contract_paisa !== a.original_contract_paisa || a.budget_paisa !== a.original_budget_paisa)

  return (
    <Card title={t('project.amounts')} actions={
      <Button variant="secondary" aria-expanded={picking} onClick={() => setPicking(!picking)}>
        {t('projectDetail.asOf')}{' '}{asOf === todayKathmandu() ? 'today' : formatDate(asOf, auth.dateDisplay)} <ChevronDownIcon size={16} className="inline" />
      </Button>
    }>
      {picking && (
        <div className="mb-3">
          <Field label={t('projectDetail.showAmountsAsOf')} htmlFor="amounts-as-of">
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
          <Detail label={t('projectDetail.contract')}>{formatNPR(a?.contract_paisa)}</Detail>
          <Detail label={t('projectDetail.spendingBudget')}>{budget === null ? t('common.notAvailable') : formatNPR(budget)}</Detail>
          <Detail label={t('projectDetail.plannedMargin')}>{formatNPR(a?.planned_margin_paisa)}</Detail>
          {finished && a?.contract_paisa != null && (
            <Detail label={a.contract_paisa - c.cost_paisa >= 0 ? t('projectDetail.finalProfit') : t('projectDetail.finalLoss')}>
              {formatNPR(Math.abs(a.contract_paisa - c.cost_paisa))}
            </Detail>
          )}
          {received.data !== undefined && a?.contract_paisa != null && (
            <>
              <h3 className="mt-4 flex items-baseline justify-between gap-2 text-sm font-medium text-subtle">
                {t('projectDetail.fromTheClient')}<Link to="?tab=client" className="-my-3.5 inline-flex min-h-11 items-center text-xs font-medium text-brand underline underline-offset-4">{t('projectDetail.seeReceipts')}</Link>
              </h3>
              <Detail label={t('projectDetail.received')}>{formatNPR(received.data)}</Detail>
              <Detail label={a.contract_paisa - received.data < 0 ? t('projectDetail.receivedMoreThanContract') : t('projectDetail.contractBalance')}>
                {formatNPR(Math.abs(a.contract_paisa - received.data))}
              </Detail>
            </>
          )}
          <h3 className="mt-4 text-sm font-medium text-subtle">{t('projectDetail.againstTheBudget')}</h3>
          <Detail label={t('projectDetail.spent')}>{formatNPR(c.cost_paisa)}</Detail>
          <Detail label={left !== null && left < 0 ? t('projectDetail.overBudgetBy') : t('projectDetail.left')}>
            {left === null ? t('common.notAvailable') : formatNPR(Math.abs(left))}
          </Detail>
          <Detail label={t('projectDetail.paid')}>{formatNPR(c.cash_paid_paisa)}</Detail>
          <Detail label={t('projectDetail.due')}>{formatNPR(c.payable_paisa + held)}</Detail>
          {held > 0 && <Detail label={t('projectDetail.theyHoldPeskiOverpaid')}><span className="text-good-ink">{formatNPR(held)}</span></Detail>}
          {/* Break it down only when more than one kind of party is owed; one kind would just repeat the total. */}
          {OWED.filter(([k]) => c.payable_by_kind[k] !== 0).length > 1 && OWED.map(([k, label]) => c.payable_by_kind[k] !== 0 && (
            <Detail key={k} label={`· ${t(label)}`}><BalanceText paisa={c.payable_by_kind[k]} /></Detail>
          ))}
          <p className="mt-3 text-xs text-subtle">
            {changed
              ? <>{t('projectDetail.startedAtContractOriginalcontract', { originalContract: formatNPR(a?.original_contract_paisa), originalBudget: formatNPR(a?.original_budget_paisa) })}{' '}<Link to="?tab=history" className="font-medium text-brand underline underline-offset-4">{t('projectDetail.seeChanges')}</Link></>
              : t('projectDetail.noChangesToThe')}
            {!finished && t('projectDetail.profitIsShownOnly')}
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

  const refreshAssigned = () => refresh(queryClient, 'projects')
  const add = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('project_assignments').insert({ company_id: auth.companyId, project_id: projectId, user_id: userId })
      if (error) throw error
    },
    onSuccess: () => {
      setAdding('')
      return refreshAssigned()
    },
  })
  const remove = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('project_assignments').delete().eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: refreshAssigned,
  })

  return (
    <Card title={t('project.team')}>
      <p className="mb-2 text-xs text-subtle">{t('projectDetail.adminsAndAccountsStaff')}</p>
      {assignments.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void assignments.refetch()}>{assignments.error && friendlyError(assignments.error)}</ErrorBanner>
      {assignments.data?.length === 0 && <p className="text-sm text-subtle">{t('projectDetail.nobodyIsAssignedYet')}</p>}
      <ul>
        {assignments.data?.map((a) => {
          const m = members.find((x) => x.user_id === a.user_id)
          const name = m?.profiles?.full_name ?? t('projectDetail.formerStaff')
          return (
            <li key={a.id} className="flex items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <div className="min-w-0 break-words">
                <div className="text-sm font-medium text-ink">{name}</div>
                <div className="text-xs text-subtle">{m?.roles.map((r) => ROLE_LABELS[r]).join(', ')}{m && !m.active && ' · inactive'}</div>
              </div>
              {auth.isAdmin && (
                <ConfirmButton label={t('projectDetail.removeName', { name })} confirmLabel={t('projectDetail.yesRemove')} disabled={remove.isPending}
                  onConfirm={() => remove.mutate(a.id)}>
                  {t('common.remove')}</ConfirmButton>
              )}
            </li>
          )
        })}
      </ul>
      {auth.isAdmin && assignable.length > 0 && (
        <div className="mt-3 flex gap-2">
          <Select aria-label={t('projectDetail.staffToAssign')} value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">{t('projectDetail.chooseStaffToAssign')}</option>
            {assignable.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name}</option>
            ))}
          </Select>
          <Button disabled={!adding} busy={add.isPending} onClick={() => add.mutate(adding)}>{t('projectDetail.assign')}</Button>
        </div>
      )}
      <ErrorBanner>{(add.error || remove.error) && friendlyError(add.error || remove.error)}</ErrorBanner>
    </Card>
  )
}
