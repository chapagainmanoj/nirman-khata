// Daily site report (req §16): photo first, what was done, people on site; the rest is optional.
// The day's deliveries are already recorded, so they are shown, not typed again (acceptance #23).
// With own labour on, the day's labour cost is saved with the report, paid now if wanted (L2).
// Unsent work stays in the device draft; once sent a report is not changed.
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PhotoPicker, type PendingPhoto, uploadPending } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import {
  Button, ButtonLink, Card, Checkbox, ErrorBanner, Field, FormActions, Input, MoreDetails, Notice, PageHeader, Select, Textarea,
} from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { useUnits } from '../catalog/api'
import { useCrews } from '../costs/api'
import { useCurrentProject } from '../projects/current'
import { useProjects } from '../projects/api'
import { projectCrumbs } from '../projects/crumbs'
import { rpc } from '../supply/api'
import { canRecordPayments } from '../supply/permissions'
import { useRefreshSite, useReportDay, useStages, WEATHER } from './api'
import { TrashIcon } from '../../components/icons'

type Line = { id: string; description: string; qty: string; unit_id: string }

type Values = {
  id: string
  op_key: string
  project_id: string
  work_date: string
  photos: PendingPhoto[]
  work_done: string
  stage_id: string
  headcount: string
  area: string
  lines: Line[]
  equipment: string
  issues: string
  weather: string
  labour_note: string
  add_labour: boolean
  crew_id: string
  amount: string
  pay_now: boolean
  method: keyof typeof PAYMENT_METHODS
}

type Saved = { id: string; labour: { total_paisa: number; payment: { number: string } | null } | null; photoFailed: number }

const blankLine = (): Line => ({ id: newId(), description: '', qty: '', unit_id: '' })

export function DailyReportPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const current = useCurrentProject()
  const projects = useProjects(auth.companyId)
  const units = useUnits(auth.companyId)
  const labourOn = auth.company.labour_module_enabled
  const crews = useCrews(auth.companyId)
  const mayPay = canRecordPayments(auth)
  const refresh = useRefreshSite()
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)
  const today = todayKathmandu()

  const fresh = (projectId = params.get('project') ?? current.projectId ?? ''): Values => ({
    id: newId(), op_key: newId(), project_id: projectId, work_date: today, photos: [], work_done: '', stage_id: '',
    headcount: '', area: '', lines: [], equipment: '', issues: '', weather: '', labour_note: '',
    add_labour: false, crew_id: '', amount: '', pay_now: mayPay, method: 'cash',
  })
  const form = useForm<Values>({ defaultValues: fresh() })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'daily-report' })
  const { register, control, watch, setValue, getValues } = form
  const v = watch()
  const stages = useStages(v.project_id)
  const day = useReportDay(v.project_id, v.work_date)
  const deliveries = day.data?.filter((e) => e.kind === 'delivery') ?? []
  const earlier = day.data?.filter((e) => e.kind === 'report') ?? []

  const crewOptions = crews.data?.filter((c) => (c.active || c.id === v.crew_id) && (!c.project_id || c.project_id === v.project_id)) ?? []
  useEffect(() => {
    if (!v.project_id || !crews.data || crewOptions.some((c) => c.id === v.crew_id)) return
    const def = crews.data.find((c) => c.project_id === v.project_id && c.is_default)
    if (def) setValue('crew_id', def.id)
  }, [v.project_id, crews.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async ({ vals, confirm }: { vals: Values; confirm: boolean }): Promise<Saved> => {
      const labour = labourOn && vals.add_labour
        ? {
            crew_id: vals.crew_id, amount_paisa: parseNPR(vals.amount), confirm_duplicate: confirm,
            pay_now: mayPay && vals.pay_now ? { method: vals.method } : null,
          }
        : null
      const r = await rpc('submit_daily_report', { p_op_key: vals.op_key, p_report: {
        id: vals.id, project_id: vals.project_id, work_date: vals.work_date, work_done: vals.work_done.trim(),
        stage_id: vals.stage_id || null, headcount: Number(vals.headcount) || null, area: vals.area.trim() || null,
        equipment: vals.equipment.trim() || null, issues: vals.issues.trim() || null, weather: vals.weather || null,
        labour_note: vals.labour_note.trim() || null,
        lines: vals.lines.filter((l) => l.description.trim()).map((l) => ({
          description: l.description.trim(), qty: Number(l.qty) || null, unit_id: l.unit_id || null,
        })),
        labour,
      } }) as unknown as { id: string; labour: Saved['labour'] }
      const photoFailed = await uploadPending(auth.companyId, { daily_report_id: vals.id }, vals.photos)
      return { ...r, photoFailed }
    },
    onSuccess: async (r) => {
      await draft.clear()
      await refresh()
      setDuplicate('')
      setSaved(r)
    },
    onError: (e) => {
      const msg = (e as { message?: string }).message ?? ''
      if (msg.startsWith('near_duplicate')) setDuplicate(msg.replace(/^near_duplicate:\s*/, ''))
    },
  })

  function submit(confirm = false) {
    const vals = getValues()
    const problem =
      !vals.project_id ? 'Choose the project.'
      : vals.work_date > today ? 'A report cannot be dated in the future.'
      : !vals.work_done.trim() ? 'Say what work was done.'
      : labourOn && vals.add_labour && !vals.crew_id ? 'Choose the crew for the labour cost.'
      : labourOn && vals.add_labour && !(parseNPR(vals.amount) ?? 0) ? 'Enter the labour cost for the day, or untick it.'
      : ''
    setError(problem)
    if (!problem) save.mutate({ vals, confirm })
  }

  if (saved) {
    return (
      <>
        <PageHeader title="Report sent" crumbs={projectCrumbs(projects.data, v.project_id)} />
        <Card>
          <p className="text-sm">The daily report is saved for the office.</p>
          {saved.labour && (
            <p className="mt-2 text-sm">
              Labour {formatNPR(saved.labour.total_paisa)}:{' '}
              {saved.labour.payment ? `paid now (${saved.labour.payment.number}).` : 'not paid yet; it shows as owed to the crew.'}
            </p>
          )}
          {saved.photoFailed > 0 && (
            <div className="mt-3"><Notice>{saved.photoFailed} photo(s) did not upload. Open the report and add them again.</Notice></div>
          )}
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink to={`/daily/${saved.id}`}>Open report</ButtonLink>
          <ButtonLink variant="secondary" to={`/projects/${v.project_id}?tab=site`}>Update progress</ButtonLink>
          <Button variant="ghost" onClick={() => { form.reset(fresh(v.project_id)); setSaved(null) }}>Another report</Button>
        </div>
      </>
    )
  }

  const lines = v.lines
  const setLine = (i: number, patch: Partial<Line>) => setValue('lines', lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  return (
    <>
      <PageHeader title="Daily report" crumbs={projectCrumbs(projects.data, v.project_id)} subtitle="What happened on site today. Only the work done is required." />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored a report you had not sent.</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project" htmlFor="dr-project">
              <Select id="dr-project" value={v.project_id} onChange={(e) => setValue('project_id', e.target.value, { shouldDirty: true })}>
                <option value="">Choose project</option>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Date" htmlFor="dr-date">
              <Controller control={control} name="work_date" render={({ field }) => (
                <DateInput id="dr-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
          </div>
          {earlier.length > 0 && (
            <p className="mt-3 text-sm text-subtle">
              Already sent for this day: {earlier.map((r, i) => (
                <span key={r.id}>{i > 0 && ', '}<Link className="text-slate underline-offset-4 hover:underline" to={`/daily/${r.id}`}>{r.label}</Link></span>
              ))}. Add another report only for different work.
            </p>
          )}
        </Card>

        <Card title="Photos">
          <PhotoPicker value={v.photos} onChange={(p) => setValue('photos', p, { shouldDirty: true })} label="Take site photo" what="Site photo" />
        </Card>

        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Work done" htmlFor="dr-work" hint="e.g. Ground floor column casting, grid A-C">
                <Textarea id="dr-work" rows={3} {...register('work_done')} />
              </Field>
            </div>
            <Field label="People on site" htmlFor="dr-head" hint="Optional"><Input id="dr-head" inputMode="numeric" {...register('headcount')} /></Field>
            {(stages.data?.length ?? 0) > 0 && (
              <Field label="Stage" htmlFor="dr-stage" hint="Optional">
                <Select id="dr-stage" {...register('stage_id')}>
                  <option value="">Not one stage</option>
                  {stages.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <div className="mt-3">
            <MoreDetails summary="Quantities, area, equipment, issues, weather"
              open={!!(v.area || v.lines.length || v.equipment || v.issues || v.weather || v.labour_note)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Area or floor" htmlFor="dr-area"><Input id="dr-area" {...register('area')} /></Field>
                <Field label="Weather" htmlFor="dr-weather">
                  <Select id="dr-weather" {...register('weather')}>
                    <option value="">Not noted</option>
                    {WEATHER.map((w) => <option key={w} value={w}>{w}</option>)}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <h3 className="mb-1 text-sm font-medium text-ink">Quantities done</h3>
                  {lines.map((l, i) => (
                    <div key={l.id} className="mb-2 grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_6rem_8rem_auto]">
                      <Input aria-label={`Item ${i + 1}`} placeholder="e.g. PCC" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                      <Input aria-label={`Quantity ${i + 1}`} inputMode="decimal" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                      <Select aria-label={`Unit ${i + 1}`} value={l.unit_id} onChange={(e) => setLine(i, { unit_id: e.target.value })}>
                        <option value="">Unit</option>
                        {units.data?.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                      </Select>
                      <Button type="button" variant="ghost" aria-label={`Remove item ${i + 1}`}
                        onClick={() => setValue('lines', lines.filter((_, j) => j !== i))}><TrashIcon size={16} />Remove</Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setValue('lines', [...lines, blankLine()])}>Add quantity</Button>
                </div>
                <Field label="Equipment used" htmlFor="dr-equip"><Input id="dr-equip" {...register('equipment')} /></Field>
                <Field label="Labour note" htmlFor="dr-lnote" hint="e.g. 4 mistri, 8 helpers"><Input id="dr-lnote" {...register('labour_note')} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Issues or delays" htmlFor="dr-issues"><Textarea id="dr-issues" rows={2} {...register('issues')} /></Field>
                </div>
              </div>
            </MoreDetails>
          </div>
        </Card>

        {v.project_id && (
          <Card title="Received this day">
            {deliveries.length === 0 ? (
              <p className="text-sm text-subtle">
                No deliveries recorded for this day.{' '}
                <Link className="font-medium text-slate underline-offset-4 hover:underline" to={`/deliveries/new?project=${v.project_id}`}>Record a delivery</Link>
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-subtle">Already recorded, so there is no need to enter them again.</p>
                <ul>
                  {deliveries.map((d) => (
                    <li key={d.id} className="border-b border-line py-2 text-sm last:border-0">
                      <span className="font-medium text-ink">{d.label}</span>{d.detail && <span className="text-subtle"> · {d.detail}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        )}

        {labourOn && (
          <Card>
            <Checkbox label="Add the day's labour cost" hint="Saved as cost for the crew, once, with this report." {...register('add_labour')} />
            {v.add_labour && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Crew" htmlFor="dr-crew">
                  <Select id="dr-crew" value={v.crew_id} onChange={(e) => setValue('crew_id', e.target.value, { shouldDirty: true })}>
                    <option value="">Choose crew</option>
                    {crewOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Labour cost for the day" htmlFor="dr-amount">
                  <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="dr-amount" value={field.value} onChange={field.onChange} />} />
                </Field>
                {mayPay && (
                  <div className="sm:col-span-2">
                    <Checkbox label="Paid now" hint="Records the payment too. The cost is counted once." {...register('pay_now')} />
                    {v.pay_now && (
                      <div className="mt-3 max-w-xs">
                        <Field label="How" htmlFor="dr-method">
                          <Select id="dr-method" {...register('method')}>
                            {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                          </Select>
                        </Field>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {duplicate && (
          <Notice>
            <span className="block">{duplicate.charAt(0).toUpperCase() + duplicate.slice(1)}. Is this a second labour entry for the same day?</span>
            <span className="mt-2 flex flex-wrap gap-2">
              <Button type="button" busy={save.isPending} onClick={() => submit(true)}>Yes, save it too</Button>
              <Button type="button" variant="secondary" onClick={() => setDuplicate('')}>No, check first</Button>
            </span>
          </Notice>
        )}
        <ErrorBanner>{error || (!duplicate && save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending}>Send report</Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
        </FormActions>
      </form>
    </>
  )
}
