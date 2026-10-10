import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Field, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { formatDate, todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { focusFirstError } from '../../lib/forms'
import { t } from '../../lib/i18n'
import { FULFILMENT, ROLE_LABELS, STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR, percent } from '../../lib/money'
import { supabase, type Tables } from '../../lib/supabase'
import { ExpenseSection, LabourSection, SubcontractSection } from '../costs/CostLists'
import { DeliveryList } from '../supply/DeliveryList'
import { useDeliveries, useDeliveryLineStatus, useProjectCost, useSlips } from '../supply/api'
import { BalanceText, Tabs } from '../parties/PartyParts'
import { canEnter } from '../supply/permissions'
import { memberName, useAmountsAsOf, useAssignments, useHeadings, useMembers, useProject, type Member } from './api'
import { ProjectDetailsFields } from './ProjectDetailsFields'
import { detailsSchema, detailsToRow, type DetailsValues } from './projectDetails'
import { RevisionsCard } from './RevisionsCard'

type Tab = 'overview' | 'deliveries' | 'subcontract' | 'labour' | 'history'

// Summary first, then today's work, then money detail, then setup (details, staff), then history.
// The long lists (deliveries, subcontract, labour) each get a tab so the page stays short.
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
    return <EmptyState title="Project not found">It does not exist or you are not assigned to it. <Link className="text-brand" to="/projects">Back to projects</Link></EmptyState>
  }
  const p = project.data
  const canEdit = auth.isAdmin || auth.hasRole('project_manager')
  const tabs: Array<[Tab, string]> = [
    ['overview', 'Overview'], ['deliveries', 'Deliveries'], ['subcontract', 'Subcontract'], ['labour', 'Labour & costs'],
    ...(auth.canSeeFinance ? [['history', 'History'] as [Tab, string]] : []),
  ]

  return (
    <>
      <PageHeader
        title={p.name}
        crumbs={[{ to: '/projects', label: 'Projects' }]}
        subtitle={<span className="flex items-center gap-2">{p.code} <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge></span>}
        actions={canEnter(auth) && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/slips/new?project=${p.id}`}>New slip</ButtonLink>
            <ButtonLink variant="secondary" to={`/labour/new?project=${p.id}`}>Enter labour</ButtonLink>
          </div>
        )}
      />
      <ScheduleWarnings project={p} />
      {auth.canSeeFinance && <SummaryStrip projectId={p.id} />}
      <Tabs tabs={tabs} value={tab} label="Project sections"
        onChange={(next) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true })}>
        {tab === 'overview' && (
          <>
            <Activity projectId={p.id} onShowDeliveries={() => setParams({ tab: 'deliveries' }, { replace: true })} />
            <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
              {auth.canSeeFinance && <AmountsCard projectId={p.id} status={p.status} />}
              <div className="flex flex-col gap-4">
                <DetailsCard project={p} members={members.data ?? []} canEdit={canEdit} />
                <TeamCard projectId={p.id} members={members.data ?? []} />
              </div>
            </div>
          </>
        )}
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
            <LabourSection projectId={p.id} />
            <ExpenseSection projectId={p.id} />
          </>
        )}
        {tab === 'history' && auth.canSeeFinance && <RevisionsCard projectId={p.id} members={members.data ?? []} />}
      </Tabs>
    </>
  )
}

/** Overdue completion, or deliveries arriving while the actual start is still blank. */
function ScheduleWarnings({ project: p }: { project: Tables<'projects'> }) {
  const deliveries = useDeliveries({ projectId: p.id })
  const today = todayKathmandu()
  const open = p.status !== 'completed' && p.status !== 'closed'
  const lateDays = open && p.planned_end && p.planned_end < today
    ? Math.round((Date.parse(today) - Date.parse(p.planned_end)) / 86_400_000) : 0
  const startedUnmarked = open && !p.actual_start && (deliveries.data?.length ?? 0) > 0
  if (!lateDays && !startedUnmarked) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {lateDays > 0 && <Notice>Planned completion was {lateDays} {lateDays === 1 ? 'day' : 'days'} ago. Update the plan or mark it completed (Edit details).</Notice>}
      {startedUnmarked && <Notice>Deliveries are arriving but the actual start date is blank. Set it under Details.</Notice>}
    </div>
  )
}

/** Headline figures: cost against budget, what is paid and owed, contract and margin. */
function SummaryStrip({ projectId }: { projectId: string }) {
  const today = todayKathmandu()
  const amounts = useAmountsAsOf(projectId, today, true)
  const cost = useProjectCost(projectId, today, true)
  const a = amounts.data
  const c = cost.data
  if (!a || !c) return null
  const budget = a.budget_paisa ?? null
  const used = budget ? Math.min(100, (c.cost_paisa / budget) * 100) : 0
  const over = budget !== null && c.cost_paisa > budget
  return (
    <section aria-label="Summary" className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3">
      <div className="sm:col-span-1">
        <div className="text-xs font-medium text-subtle">Cost so far</div>
        <div className="text-2xl font-semibold text-ink tabular-nums">{formatNPR(c.cost_paisa)}</div>
        {budget !== null && (
          <>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Budget used"
              aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-brand'}`} style={{ width: `${used}%` }} />
            </div>
            <div className={`mt-1 text-xs ${over ? 'font-medium text-danger' : 'text-subtle'}`}>
              {percent(c.cost_paisa, budget)} of {formatNPR(budget)} budget{over && ' (over budget)'}
            </div>
          </>
        )}
      </div>
      <div>
        <div className="text-xs font-medium text-subtle">Paid</div>
        <div className="text-2xl font-semibold text-ink tabular-nums">{formatNPR(c.cash_paid_paisa)}</div>
        <div className="mt-1 text-xs text-subtle">Still owed <span className="font-semibold text-ink">{formatNPR(c.payable_paisa)}</span></div>
      </div>
      <div>
        <div className="text-xs font-medium text-subtle">Contract</div>
        <div className="text-2xl font-semibold text-ink tabular-nums">{formatNPR(a.contract_paisa)}</div>
        <div className="mt-1 text-xs text-subtle">Planned margin <span className="font-semibold text-ink">{formatNPR(a.planned_margin_paisa)}</span></div>
      </div>
    </section>
  )
}

/** What needs doing: slips waiting for delivery, deliveries not billed, latest arrivals. */
function Activity({ projectId, onShowDeliveries }: { projectId: string; onShowDeliveries: () => void }) {
  const auth = useCompany()
  const slips = useSlips(auth.companyId)
  const deliveries = useDeliveries({ projectId })
  const unbilled = useDeliveryLineStatus({ projectId, billableOnly: true })
  const waiting = slips.data?.filter((s) => s.status === 'approved' && ['not_received', 'partially_received'].includes(s.fulfilment)
    && s.order_slip_lines.some((l) => l.project_id === projectId)) ?? []
  const recent = deliveries.data?.slice(0, 3) ?? []
  const unbilledCount = unbilled.data?.length ?? 0
  if (slips.isPending || deliveries.isPending) return <Spinner />
  if (!waiting.length && !recent.length && !unbilledCount) {
    return <p className="text-sm text-subtle">No slips or deliveries yet. Start with a new slip for the materials this site needs.</p>
  }
  return (
    <Card title="Activity">
      {waiting.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-subtle">Waiting for delivery</h3>
          <ul className="mb-3">
            {waiting.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                <Link to={`/slips/${s.id}`} className="min-w-0 text-sm hover:underline">
                  <span className="font-medium text-ink">{s.number}</span> · {s.suppliers?.name}{' '}
                  <Badge tone={FULFILMENT[s.fulfilment][1]}>{FULFILMENT[s.fulfilment][0]}</Badge>
                </Link>
                {canEnter(auth) && <ButtonLink variant="secondary" to={`/deliveries/new?slip=${s.id}&project=${projectId}`}>Record delivery</ButtonLink>}
              </li>
            ))}
          </ul>
        </>
      )}
      {unbilledCount > 0 && (
        <div className="mb-3">
          <Notice>
            {unbilledCount} delivered item(s) are not billed yet, so cost is not complete.{' '}
            <button type="button" className="font-semibold underline underline-offset-4" onClick={onShowDeliveries}>Enter their bills</button>
          </Notice>
        </div>
      )}
      {recent.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-subtle">Latest deliveries</h3>
          <ul>
            {recent.map((d) => (
              <li key={d.id} className="flex justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
                <span className="min-w-0 break-words">
                  {d.suppliers?.name} · {d.delivery_lines.map((l) => l.materials?.name ?? l.material_text).join(', ')}
                </span>
                <span className="shrink-0 text-subtle"><DateText value={d.receipt_date} display={auth.dateDisplay} /></span>
              </li>
            ))}
          </ul>
          <Button variant="ghost" className="mt-1" onClick={onShowDeliveries}>All deliveries</Button>
        </>
      )}
    </Card>
  )
}

function DetailsCard({ project: p, members, canEdit }: { project: Tables<'projects'>; members: Member[]; canEdit: boolean }) {
  const auth = useCompany()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
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
        <form onSubmit={form.handleSubmit((v) => save.mutate(v), (errs, e) => focusFirstError(errs, e?.target as HTMLFormElement))} className="flex flex-col gap-4">
          <ProjectDetailsFields form={form} members={members} display={auth.dateDisplay} showActualDates />
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
  const headings = useHeadings(auth.companyId)
  const a = amounts.data
  const c = cost.data
  const finished = status === 'completed' || status === 'closed'
  const budget = a?.budget_paisa ?? null
  const headingName = (id: string) => {
    const h = headings.data?.find((x) => x.id === id)
    const parent = headings.data?.find((x) => x.id === h?.parent_id)
    return h ? (parent ? `${parent.name} › ${h.name}` : h.name) : 'Heading'
  }

  return (
    <Card title={t('project.amounts')} actions={
      <Button variant="secondary" aria-expanded={picking} onClick={() => setPicking(!picking)}>
        As of {asOf === todayKathmandu() ? 'today' : formatDate(asOf, auth.dateDisplay)} <span aria-hidden>▾</span>
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
          <Detail label="Current spending budget">{formatNPR(budget)}</Detail>
          <Detail label="Recorded cost">{formatNPR(c.cost_paisa)}</Detail>
          <Detail label="Budget used">{percent(c.cost_paisa, budget)}</Detail>
          <Detail label="Budget remaining">{budget === null ? t('common.notAvailable') : formatNPR(budget - c.cost_paisa)}</Detail>
          <Detail label="Cash paid">{formatNPR(c.cash_paid_paisa)}</Detail>
          <Detail label="Still owed">{formatNPR(c.payable_paisa)}</Detail>
          {/* Break it down only when more than one kind of party is owed; one kind would just repeat the total. */}
          {OWED.filter(([k]) => c.payable_by_kind[k] !== 0).length > 1 && OWED.map(([k, label]) => c.payable_by_kind[k] !== 0 && (
            <Detail key={k} label={`· ${label}`}><BalanceText paisa={c.payable_by_kind[k]} /></Detail>
          ))}
          <Detail label="Current contract">{formatNPR(a?.contract_paisa)}</Detail>
          <Detail label="Planned margin">{formatNPR(a?.planned_margin_paisa)}</Detail>
          {finished && a?.contract_paisa != null && (
            <Detail label={a.contract_paisa - c.cost_paisa >= 0 ? 'Final profit' : 'Final loss'}>
              {formatNPR(Math.abs(a.contract_paisa - c.cost_paisa))}
            </Detail>
          )}
          {c.by_heading.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink">Cost by heading</summary>
              {c.by_heading.map((h) => <Detail key={h.heading_id} label={headingName(h.heading_id)}>{formatNPR(h.cost_paisa)}</Detail>)}
            </details>
          )}
          <p className="mt-3 text-xs text-subtle">
            Original contract {formatNPR(a?.original_contract_paisa)}, original budget {formatNPR(a?.original_budget_paisa)}.
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
