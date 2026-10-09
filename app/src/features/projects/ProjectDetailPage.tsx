import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ButtonLink, Card, ConfirmButton, Detail, EmptyState, ErrorBanner, Field, Notice, PageHeader, Select, Spinner } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { focusFirstError } from '../../lib/forms'
import { t } from '../../lib/i18n'
import { ROLE_LABELS, STATUS_LABELS, STATUS_TONE } from '../../lib/labels'
import { formatNPR, percent } from '../../lib/money'
import { supabase, type Tables } from '../../lib/supabase'
import { DeliveryList } from '../supply/DeliveryList'
import { useProjectCost } from '../supply/api'
import { canEnter } from '../supply/permissions'
import { memberName, useAmountsAsOf, useAssignments, useHeadings, useMembers, useProject, type Member } from './api'
import { ProjectDetailsFields } from './ProjectDetailsFields'
import { detailsSchema, detailsToRow, type DetailsValues } from './projectDetails'
import { RevisionsCard } from './RevisionsCard'

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const auth = useCompany()
  const project = useProject(projectId)
  const members = useMembers(auth.companyId)

  if (project.isPending) return <Spinner />
  if (project.error) return <ErrorBanner onRetry={() => void project.refetch()}>{friendlyError(project.error)}</ErrorBanner>
  if (!project.data) {
    return <EmptyState title="Project not found">It does not exist or you are not assigned to it. <Link className="text-brand" to="/projects">Back to projects</Link></EmptyState>
  }
  const p = project.data
  const canEdit = auth.isAdmin || auth.hasRole('project_manager')

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={<span className="flex items-center gap-2">{p.code} <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge></span>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailsCard project={p} members={members.data ?? []} canEdit={canEdit} />
        {auth.canSeeFinance && <AmountsCard projectId={p.id} status={p.status} />}
        <TeamCard projectId={p.id} members={members.data ?? []} />
        {auth.canSeeFinance && <RevisionsCard projectId={p.id} members={members.data ?? []} />}
      </div>
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Deliveries</h2>
          {canEnter(auth) && <ButtonLink variant="secondary" to={`/deliveries/new?project=${p.id}`}>Record delivery without slip</ButtonLink>}
        </div>
        <DeliveryList filter={{ projectId: p.id }} />
      </section>
    </>
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
  return (
    <Card title={t('project.details')} actions={canEdit && <Button variant="ghost" onClick={() => setEditing(true)}>{t('common.edit')}</Button>}>
      <Detail label="Client">{[p.client_name, p.client_phone].filter(Boolean).join(' · ')}</Detail>
      <Detail label="Location">{[p.location_note, p.ward && `Ward ${p.ward}`, p.municipality, p.district].filter(Boolean).join(', ')}</Detail>
      <Detail label="Project manager">{memberName(members, p.manager_id)}</Detail>
      <Detail label="Planned start"><DateText value={p.planned_start} display={d} dual /></Detail>
      <Detail label="Planned completion"><DateText value={p.planned_end} display={d} dual /></Detail>
      <Detail label="Actual start"><DateText value={p.actual_start} display={d} dual /></Detail>
      <Detail label="Actual completion"><DateText value={p.actual_end} display={d} dual /></Detail>
    </Card>
  )
}

function AmountsCard({ projectId, status }: { projectId: string; status: Tables<'projects'>['status'] }) {
  const auth = useCompany()
  const [asOf, setAsOf] = useState(todayKathmandu())
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
    <Card title={t('project.amounts')}>
      <div className="mb-3">
        <Field label="As of" htmlFor="amounts-as-of">
          <DateInput id="amounts-as-of" value={asOf} onChange={(v) => v && setAsOf(v)} display={auth.dateDisplay} />
        </Field>
      </div>
      {(amounts.isPending || cost.isPending) && <Spinner />}
      <ErrorBanner onRetry={() => { void amounts.refetch(); void cost.refetch() }}>
        {(amounts.error || cost.error) && friendlyError(amounts.error || cost.error)}
      </ErrorBanner>
      {amounts.data !== undefined && c && (
        <>
          {c.unbilled_delivery_lines > 0 && (
            <div className="mb-3">
              <Notice>{c.unbilled_delivery_lines} delivered item(s) are not billed yet, so recorded cost is not complete.</Notice>
            </div>
          )}
          <Detail label="Current spending budget">{formatNPR(budget)}</Detail>
          <Detail label="Recorded cost">{formatNPR(c.cost_paisa)}</Detail>
          <Detail label="Budget used">{percent(c.cost_paisa, budget)}</Detail>
          <Detail label="Budget remaining">{budget === null ? t('common.notAvailable') : formatNPR(budget - c.cost_paisa)}</Detail>
          <Detail label="Cash paid to suppliers">{formatNPR(c.cash_paid_paisa)}</Detail>
          <Detail label="Owed to suppliers">{formatNPR(c.payable_paisa)}</Detail>
          <Detail label="Current contract">{formatNPR(a?.contract_paisa)}</Detail>
          <Detail label="Planned margin">{formatNPR(a?.planned_margin_paisa)}</Detail>
          {finished && a?.contract_paisa != null && (
            <Detail label={a.contract_paisa - c.cost_paisa >= 0 ? 'Final profit' : 'Final loss'}>
              {formatNPR(Math.abs(a.contract_paisa - c.cost_paisa))}
            </Detail>
          )}
          {c.by_heading.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand">Cost by heading</summary>
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
