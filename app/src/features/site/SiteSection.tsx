// The project's "Site" tab (req §16): stage progress, progress updates and daily reports.
// Progress is entered, never worked out from cost: 40% done and 65% of budget used are
// separate figures (acceptance #10). A wrong figure is fixed by a newer update, not an edit.
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments, PhotoPicker, type PendingPhoto, uploadPending } from '../../components/Attachments'
import { DateInput, DateText } from '../../components/DateInput'
import { Badge, Button, ButtonLink, Card, Checkbox, ErrorBanner, Field, Input, Notice, Select, Spinner, Textarea } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { ShowMore } from '../../components/ShowMore'
import { newId } from '../../lib/ids'
import { memberName, useMembers, useProjects } from '../projects/api'
import { supabase, type Tables } from '../../lib/supabase'
import { rpc } from '../../data/rpc'
import { canEnter } from '../../data/permissions'
import { STAGE_LIST, type ProgressRow, useDailyReports, useProgress, useRefreshSite, useStages } from './api'
import { t } from '../../lib/i18n'

const pctText = (n: number | null | undefined) => (n == null ? t('siteSection.notSet') : `${Number(n).toFixed(2).replace(/\.?0+$/, '')}%`)

export function SiteSection({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const canPlan = auth.isAdmin || auth.hasRole('project_manager')
  const stages = useStages(projectId)
  const [updating, setUpdating] = useState<string | null>(null) // stage id, '' = overall
  const [setup, setSetup] = useState(false)

  return (
    // Side by side on a laptop; stacked on a phone, progress first.
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card title={t('siteSection.progress')} actions={canPlan && !setup && (
        <Button variant="ghost" onClick={() => setSetup(true)}>{stages.data?.length ? t('siteSection.addStages') : t('siteSection.setUpStages')}</Button>
      )}>
        {setup && <StagesSetup projectId={projectId} onDone={() => setSetup(false)} />}
        <ProgressList projectId={projectId} canUpdate={canEnter(auth)} onUpdate={setUpdating} updating={updating} />
      </Card>
      <ReportsByDay projectId={projectId} />
    </div>
  )
}

function ProgressList({ projectId, canUpdate, onUpdate, updating }: {
  projectId: string; canUpdate: boolean; onUpdate: (id: string | null) => void; updating: string | null
}) {
  const auth = useCompany()
  const progress = useProgress(projectId)
  if (progress.isPending) return <Spinner />
  if (progress.error) return <ErrorBanner onRetry={() => void progress.refetch()}>{friendlyError(progress.error)}</ErrorBanner>
  const rows = progress.data ?? []

  return (
    <ul>
      {rows.map((r) => {
        const key = r.stage_id ?? ''
        const name = r.stage_id ? r.name : t('siteSection.overall')
        return (
          <li key={key} className="border-b border-line py-3 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className={`text-sm ${r.stage_id ? 'text-ink' : 'font-semibold text-ink'}`}>{name}</span>{' '}
                {r.overdue && <Badge tone="bad">{t('siteSection.overdue')}</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">{pctText(r.pct)}</span>
                {canUpdate && updating !== key && (
                  <Button variant="secondary" aria-label={t('siteSection.updateProgressName', { name })} onClick={() => onUpdate(key)}>{t('siteSection.update')}</Button>
                )}
              </div>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t('siteSection.nameProgress', { name })}
              aria-valuenow={Number(r.pct ?? 0)} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${r.overdue ? 'bg-danger' : 'bg-bar'}`} style={{ width: `${Number(r.pct ?? 0)}%` }} />
            </div>
            {r.effective_date && (
              <div className="mt-1 text-xs text-subtle">{t('siteSection.asOf')}{' '}<DateText value={r.effective_date} display={auth.dateDisplay} />
                {r.planned_end && <> {t('siteSection.plannedFinish')}{' '}<DateText value={r.planned_end} display={auth.dateDisplay} /></>}
              </div>
            )}
            {updating === key && <ProgressUpdateForm projectId={projectId} row={r} onDone={() => onUpdate(null)} />}
          </li>
        )
      })}
      {rows.length <= 1 && (
        <li className="pt-3 text-sm text-subtle">{t('siteSection.noStagesYetOverall')}</li>
      )}
    </ul>
  )
}

/** A new progress figure. Lower than before needs a reason, which the server checks too. */
function ProgressUpdateForm({ projectId, row, onDone }: { projectId: string; row: ProgressRow; onDone: () => void }) {
  const auth = useCompany()
  const refresh = useRefreshSite()
  const [id] = useState(newId)
  const [pct, setPct] = useState(row.pct == null ? '' : String(Number(row.pct)))
  const [date, setDate] = useState(todayKathmandu())
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [error, setError] = useState('')
  // Saved, but some photos are still on the phone: show them here to upload again.
  const [photosWaiting, setPhotosWaiting] = useState(false)
  const lower = row.pct != null && pct !== '' && Number(pct) < Number(row.pct)

  const save = useMutation({
    mutationFn: async () => {
      await rpc('add_progress_update', { p_update: {
        id, project_id: projectId, stage_id: row.stage_id, effective_date: date, pct: Number(pct),
        notes: notes.trim() || null, reason: reason.trim() || null,
      } })
      return uploadPending({ userId: auth.userId, companyId: auth.companyId }, { progress_update_id: id }, photos)
    },
    onSuccess: async (failed) => {
      if (failed) return setPhotosWaiting(true)
      await refresh()
      onDone()
    },
  })

  function submit() {
    const n = Number(pct)
    const problem =
      pct === '' || Number.isNaN(n) || n < 0 || n > 100 ? t('siteSection.enterProgressFrom0')
      : date > todayKathmandu() ? t('siteSection.progressCannotBeDated')
      : lower && !reason.trim() ? t('siteSection.progressGoesDownFrom', { pct: pctText(row.pct), n: pctText(n) })
      : ''
    setError(problem)
    if (!problem) save.mutate()
  }
  const serverError = save.error && ((save.error as { message?: string }).message ?? '').startsWith('reason_required')
    ? t('siteSection.progressOnThatDate')
    : save.error && friendlyError(save.error)

  if (photosWaiting) {
    return (
      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line p-3">
        <Notice>{t('siteSection.progressIsSavedBut')}</Notice>
        <Attachments owner={{ progress_update_id: id }} canAdd={false} />
        <div><Button variant="secondary" onClick={() => { void refresh(); onDone() }}>{t('siteSection.done')}</Button></div>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('siteSection.progress2')} htmlFor={`pu-pct-${id}`} hint={t('siteSection.nowPct', { pct: pctText(row.pct) })}>
          <Input id={`pu-pct-${id}`} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </Field>
        <Field label={t('siteSection.asOf')} htmlFor={`pu-date-${id}`}>
          <DateInput id={`pu-date-${id}`} value={date} onChange={setDate} display={auth.dateDisplay} />
        </Field>
        {(lower || serverError) && (
          <div className="sm:col-span-2">
            <Field label={t('siteSection.whyItGoesDown')} htmlFor={`pu-reason-${id}`} hint={t('siteSection.eg.workFoundFaulty')}>
              <Input id={`pu-reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="sm:col-span-2">
          <Field label={t('common.note')} htmlFor={`pu-notes-${id}`} hint={t('common.optional')}><Textarea id={`pu-notes-${id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="sm:col-span-2"><PhotoPicker value={photos} onChange={setPhotos} label={t('siteSection.addPhoto')} what={t('siteSection.progressPhoto')} /></div>
      </div>
      <div className="mt-2"><ErrorBanner>{error || serverError}</ErrorBanner></div>
      <div className="mt-3 flex gap-2">
        <Button busy={save.isPending} onClick={submit}>{t('siteSection.saveProgress')}</Button>
        <Button variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}

/** Stages from the common list, a name of one's own, or another project's list. */
function StagesSetup({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const auth = useCompany()
  const refresh = useRefreshSite()
  const stages = useStages(projectId)
  const projects = useProjects(auth.companyId)
  const existing = new Set(stages.data?.map((s) => s.name.trim().toLowerCase()))
  const [picked, setPicked] = useState<string[]>(() => STAGE_LIST.filter((s) => !existing.has(s.toLowerCase())))
  const [own, setOwn] = useState('')
  const [from, setFrom] = useState('')

  // Close straight away and refresh behind: waiting for every site query to refetch kept the
  // form open for seconds on a slow connection (and outran the e2e wait on CI).
  const create = useMutation({
    mutationFn: () => rpc('create_stages', { p_project: projectId, p_names: [...picked, ...own.split(',').map((s) => s.trim()).filter(Boolean)] }),
    onSuccess: () => { onDone(); void refresh() },
  })
  const copy = useMutation({
    mutationFn: () => rpc('copy_stages', { p_from: from, p_to: projectId }),
    onSuccess: () => { onDone(); void refresh() },
  })
  const others = projects.data?.filter((p) => p.id !== projectId) ?? []

  return (
    <div className="mb-4 rounded-lg border border-line p-3">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">{t('siteSection.commonStages')}</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {STAGE_LIST.map((s) => {
            const has = existing.has(s.toLowerCase())
            return (
              <Checkbox key={s} label={has ? t('siteSection.sAlreadyAdded', { s }) : s} disabled={has} checked={has || picked.includes(s)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, s] : picked.filter((x) => x !== s))} />
            )
          })}
        </div>
      </fieldset>
      <div className="mt-3">
        <Field label={t('siteSection.otherStages')} htmlFor="st-own" hint={t('siteSection.separateWithCommasE')}>
          <Input id="st-own" value={own} onChange={(e) => setOwn(e.target.value)} />
        </Field>
      </div>
      <ErrorBanner>{(create.error || copy.error) && friendlyError(create.error || copy.error)}</ErrorBanner>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button busy={create.isPending} disabled={!picked.length && !own.trim()} onClick={() => create.mutate()}>{t('siteSection.addStages')}</Button>
        <Button variant="ghost" onClick={onDone}>{t('common.cancel')}</Button>
      </div>
      {(stages.data?.length ?? 0) > 0 && <StageDates stages={stages.data ?? []} />}
      {others.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <Field label={t('siteSection.orCopyTheStages')} htmlFor="st-from">
            <div className="flex gap-2">
              <Select id="st-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">{t('common.project.choose')}</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
              <Button variant="secondary" disabled={!from} busy={copy.isPending} onClick={() => copy.mutate()}>{t('siteSection.copy')}</Button>
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}

/** Planned finish per stage; a stage past it and below 100% shows as overdue. */
function StageDates({ stages }: { stages: Tables<'stages'>[] }) {
  const auth = useCompany()
  const refresh = useRefreshSite()
  const save = useMutation({
    mutationFn: async ({ id, planned_end }: { id: string; planned_end: string | null }) => {
      const { error } = await supabase.from('stages').update({ planned_end }).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
  })
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-ink">{t('siteSection.plannedFinishOfEach')}</summary>
      <div className="mt-2 flex flex-col gap-3">
        {stages.map((s) => (
          <Field key={s.id} label={s.name} htmlFor={`st-end-${s.id}`}>
            <DateInput id={`st-end-${s.id}`} value={s.planned_end} allowEmpty display={auth.dateDisplay}
              onChange={(v) => save.mutate({ id: s.id, planned_end: v || null })} />
          </Field>
        ))}
      </div>
      <ErrorBanner>{save.error && friendlyError(save.error)}</ErrorBanner>
    </details>
  )
}

function ReportsByDay({ projectId }: { projectId: string }) {
  const auth = useCompany()
  const reports = useDailyReports(projectId)
  const members = useMembers(auth.companyId)
  const days = new Map<string, NonNullable<typeof reports.data>>()
  for (const r of reports.data ?? []) days.set(r.work_date, [...(days.get(r.work_date) ?? []), r])

  return (
    <Card title={t('siteSection.dailyReports')} actions={canEnter(auth) && <ButtonLink variant="secondary" to={`/daily/new?project=${projectId}`}>{t('siteSection.dailyReport')}</ButtonLink>}>
      {reports.isPending && <Spinner />}
      <ErrorBanner onRetry={() => void reports.refetch()}>{reports.error && friendlyError(reports.error)}</ErrorBanner>
      {reports.data?.length === 0 && <p className="text-sm text-subtle">{t('siteSection.noReportsYetSite')}</p>}
      {[...days].map(([day, list]) => (
        <section key={day} className="border-b border-line py-2 last:border-0">
          <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase"><DateText value={day} display={auth.dateDisplay} /></h3>
          <ul>
            {list.map((r) => (
              <li key={r.id}>
                <Link to={`/daily/${r.id}`} className="block min-h-11 rounded-md py-1.5 hover:bg-muted">
                  <span className="block text-sm text-ink">{r.work_done}</span>
                  <span className="block text-xs text-subtle">
                    {[r.stages?.name, r.area, r.headcount != null && t('siteSection.headcountPeople', { headcount: r.headcount }), memberName(members.data, r.created_by)].filter(Boolean).join(' · ')}
                  </span>
                  {r.issues && <span className="block text-xs font-medium text-warn">{t('siteSection.issueIssues', { issues: r.issues })}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ShowMore list={reports} />
    </Card>
  )
}
