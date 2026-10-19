// Create or edit an order slip (maag slip) on the phone (req §9.2). One supplier per slip;
// each line names its project. The form is kept on the device until it is saved.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { More } from '../../components/More'
import { Button, Card, ErrorBanner, Field, FormActions, Input, MoreDetails, Notice, PageHeader, Select, Spinner, type Crumb } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { newId } from '../../lib/ids'
import { paisaToInput, parseNPR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import { useMaterials, useUnits } from '../catalog/api'
import { MaterialOptions } from '../catalog/MaterialOptions'
import { useProjects } from '../projects/api'
import { projectChoices, useWorkingOnDefault } from '../projects/current'
import { rpc, saveUnlessSent, useSlip, useSuppliers } from './api'
import { TrashIcon } from '../../components/icons'

export type LineValues = {
  id: string
  project_id: string
  material_id: string // '' with material_text = typed material
  material_text: string
  spec: string
  qty: string
  unit_id: string
  unit_note: string
  est_rate: string
  note: string
}

type SlipValues = {
  id: string
  supplier_id: string
  request_date: string
  required_date: string
  delivery_instructions: string
  site_contact: string
  notes: string
  lines: LineValues[]
  submit_key?: string // operation key for "Send", kept with the device draft until it succeeds
}

const OTHER = '__other__'

export function SlipEditPage() {
  const { slipId } = useParams()
  const existing = useSlip(slipId ?? '')
  if (slipId && existing.isPending) return <Spinner />
  if (slipId && existing.error) return <ErrorBanner onRetry={() => void existing.refetch()}>{friendlyError(existing.error)}</ErrorBanner>
  const data = slipId ? existing.data : null
  if (slipId && (!data || !data.perms?.can_edit)) {
    return <ErrorBanner>{t('slip.cannotEdit')}</ErrorBanner>
  }
  const initial: SlipValues | undefined = data
    ? {
        id: data.slip.id, supplier_id: data.slip.supplier_id, request_date: data.slip.request_date,
        required_date: data.slip.required_date ?? '', delivery_instructions: data.slip.delivery_instructions ?? '',
        site_contact: data.slip.site_contact ?? '', notes: data.slip.notes ?? '',
        lines: data.lines.map((l) => ({
          id: l.id, project_id: l.project_id, material_id: l.material_id ?? OTHER, material_text: l.material_text ?? '',
          spec: l.spec ?? '', qty: String(l.qty), unit_id: l.unit_id, unit_note: l.unit_note ?? '',
          est_rate: paisaToInput(l.est_rate_paisa), note: l.note ?? '',
        })),
        submit_key: newId(),
      }
    : undefined
  return <SlipForm key={slipId ?? 'new'} initial={initial} number={data?.slip.number} />
}

function SlipForm({ initial, number }: { initial?: SlipValues; number?: string }) {
  const crumbs: Crumb[] = initial
    ? [{ to: '/slips', label: t('nav.slips') }, { to: `/slips/${initial.id}`, label: number ?? t('slip.crumb') }]
    : [{ to: '/slips', label: t('nav.slips') }]
  const auth = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const suppliers = useSuppliers(auth.companyId)
  const projects = useProjects(auth.companyId)
  const materials = useMaterials(auth.companyId)
  const units = useUnits(auth.companyId)
  const [error, setError] = useState('')
  const [showNeeded, setShowNeeded] = useState(false)

  // Site work: Active and On hold, plus any project already on the slip being edited.
  const workable = projectChoices(projects.data, 'site', initial?.lines.map((l) => l.project_id))
  const emptyLine = (projectId = params.get('project') ?? (workable.length === 1 ? workable[0].id : '')): LineValues => ({
    id: newId(), project_id: projectId, material_id: '', material_text: '', spec: '', qty: '', unit_id: '', unit_note: '', est_rate: '', note: '',
  })

  const form = useForm<SlipValues>({
    defaultValues: initial ?? {
      id: newId(), supplier_id: params.get('supplier') ?? '', request_date: todayKathmandu(), required_date: '',
      delivery_instructions: '', site_contact: auth.profile?.phone ?? '', notes: '', lines: [emptyLine()], submit_key: newId(),
    },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: initial ? `slip-${initial.id}` : 'slip-new' })
  const lines = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' })
  const { register, control, watch, setValue } = form

  // No project in the link: the first line starts on the Working on project.
  useWorkingOnDefault(watch('lines.0.project_id') ?? '', (id) => setValue('lines.0.project_id', id), !!initial || params.has('project'))

  // Single-project users: fill the project once the list loads.
  useEffect(() => {
    if (workable.length === 1) {
      form.getValues('lines').forEach((l, i) => !l.project_id && setValue(`lines.${i}.project_id`, workable[0].id))
    }
  }, [workable.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: SlipValues; submit: boolean }) => {
      const key = v.submit_key ?? newId()
      const saveDraft = () => rpc('save_slip_draft', {
        p_slip: {
          id: v.id, supplier_id: v.supplier_id, request_date: v.request_date, required_date: v.required_date || null,
          delivery_instructions: v.delivery_instructions, site_contact: v.site_contact, notes: v.notes,
          lines: v.lines.map((l) => ({
            id: l.id, project_id: l.project_id,
            material_id: l.material_id && l.material_id !== OTHER ? l.material_id : null,
            material_text: l.material_id === OTHER || !l.material_id ? l.material_text : null,
            spec: l.spec || null, qty: Number(l.qty), unit_id: l.unit_id, unit_note: l.unit_note || null, note: l.note || null,
            est_rate_paisa: auth.canSeeFinance && l.est_rate ? parseNPR(l.est_rate) : null,
          })),
        },
      })
      if (!submit) {
        await saveDraft()
        return { id: v.id, alreadySent: false }
      }
      // Kept on the device first, so a reload after a lost answer retries with the same id and key.
      await draft.save()
      // A retry after a lost answer finds the slip already sent, unless it was rejected since.
      const sent = await saveUnlessSent(key, saveDraft, async () => {
        const { data } = await supabase.from('order_slips').select('status').eq('id', v.id).maybeSingle()
        return data?.status === 'draft' || data?.status === 'rejected'
      })
      const alreadySent = sent.alreadySent
      if (sent.key !== key) {
        setValue('submit_key', sent.key)
        await draft.save()
      }
      if (!alreadySent) await rpc('submit_slip', { p_slip: v.id, p_op_key: sent.key })
      return { id: v.id, alreadySent }
    },
    onSuccess: async ({ id, alreadySent }) => {
      await draft.clear()
      await queryClient.invalidateQueries({ queryKey: ['slips'] })
      await queryClient.invalidateQueries({ queryKey: ['slip', id] })
      navigate(`/slips/${id}`, { replace: true, state: alreadySent ? { alreadySent } : undefined })
    },
  })

  function validate(v: SlipValues): string {
    if (!v.supplier_id) return t('slip.err.supplier')
    if (!v.lines.length) return t('slip.err.lines')
    for (const [i, l] of v.lines.entries()) {
      const n = i + 1
      if (!l.project_id) return t('slip.err.project', { n })
      if (!l.material_id || (l.material_id === OTHER && !l.material_text.trim())) return t('slip.err.material', { n })
      if (!(Number(l.qty) > 0)) return t('slip.err.qty', { n })
      if (!l.unit_id) return t('slip.err.unit', { n })
      if (units.data?.find((u) => u.id === l.unit_id)?.needs_note && !l.unit_note.trim()) return t('slip.err.vehicle', { n })
      if (l.est_rate && parseNPR(l.est_rate) === null) return t('slip.err.rate', { n })
    }
    return ''
  }

  function run(submit: boolean) {
    // With one project the picker is hidden; every line is for that project.
    if (workable.length === 1) form.getValues('lines').forEach((l, i) => !l.project_id && setValue(`lines.${i}.project_id`, workable[0].id))
    const v = form.getValues()
    const problem = validate(v)
    setError(problem)
    if (!problem) save.mutate({ v, submit })
  }

  function pickMaterial(i: number, materialId: string) {
    setValue(`lines.${i}.material_id`, materialId)
    const m = materials.data?.find((x) => x.id === materialId)
    if (m) setValue(`lines.${i}.unit_id`, m.default_unit_id)
  }

  return (
    <>
      <PageHeader title={initial ? t('slip.title.edit') : t('slip.title.new')} crumbs={crumbs} subtitle={t('slip.subtitle')} />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('slip.restored')}</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); run(true) }} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.supplier')} htmlFor="slip-supplier">
              <Select id="slip-supplier" value={watch('supplier_id')} onChange={(e) => form.setValue('supplier_id', e.target.value, { shouldDirty: true })}>
                <option value="">{t('common.supplier.choose')}</option>
                {suppliers.data?.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.categories.length ? ` (${s.categories.join(', ')})` : ''}</option>
                ))}
              </Select>
            </Field>
            {(showNeeded || watch('required_date')) ? (
              <Field label={t('slip.neededBy')} htmlFor="slip-required">
                <Controller control={control} name="required_date" render={({ field }) => (
                  <DateInput id="slip-required" value={field.value} onChange={field.onChange} display={auth.dateDisplay} allowEmpty quick="future" />
                )} />
              </Field>
            ) : (
              <div className="sm:self-end"><Button type="button" variant="ghost" onClick={() => setShowNeeded(true)}>{t('slip.neededBy.add')}</Button></div>
            )}
          </div>
        </Card>

        {lines.fields.map((line, i) => {
          const materialId = watch(`lines.${i}.material_id`)
          const unit = units.data?.find((u) => u.id === watch(`lines.${i}.unit_id`))
          return (
            <Card key={line.key} title={t('slip.line', { n: i + 1 })}
              actions={lines.fields.length > 1 && <Button type="button" variant="ghost" onClick={() => lines.remove(i)}><TrashIcon size={16} />{t('common.remove')}</Button>}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('common.material')} htmlFor={`l${i}-material`}>
                  <Select id={`l${i}-material`} value={materialId} onChange={(e) => pickMaterial(i, e.target.value)}>
                    <option value="">{t('common.material.choose')}</option>
                    <MaterialOptions companyId={auth.companyId} userId={auth.userId} />
                    <option value={OTHER}>{t('common.material.other')}</option>
                  </Select>
                </Field>
                {materialId === OTHER && (
                  <Field label={t('common.material.name')} htmlFor={`l${i}-text`}><Input id={`l${i}-text`} {...register(`lines.${i}.material_text`)} /></Field>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] gap-2">
                  <Field label={t('slip.qty')} htmlFor={`l${i}-qty`}>
                    <Input id={`l${i}-qty`} inputMode="decimal" {...register(`lines.${i}.qty`)} />
                  </Field>
                  <Field label={t('common.unit')} htmlFor={`l${i}-unit`}>
                    <Select id={`l${i}-unit`} value={watch(`lines.${i}.unit_id`)} onChange={(e) => setValue(`lines.${i}.unit_id`, e.target.value)}>
                      <option value="">{t('common.unit')}</option>
                      {units.data?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                </div>
                {unit?.needs_note && (
                  <Field label={t('slip.vehicle', { unit: unit.name.toLowerCase() })} htmlFor={`l${i}-unote`} hint={t('slip.vehicle.hint')}>
                    <Input id={`l${i}-unote`} {...register(`lines.${i}.unit_note`)} />
                  </Field>
                )}
                {/* With one project there is nothing to choose; it is filled in on save. */}
                {workable.length !== 1 && (
                  <Field label={t('slip.project')} htmlFor={`l${i}-project`}>
                    <Select id={`l${i}-project`} value={watch(`lines.${i}.project_id`)} onChange={(e) => setValue(`lines.${i}.project_id`, e.target.value)}>
                      <option value="">{t('common.project.choose')}</option>
                      {workable.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
              <MoreDetails open={!!(watch(`lines.${i}.spec`) || watch(`lines.${i}.est_rate`) || watch(`lines.${i}.note`))}
                summary={t('slip.more')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('slip.spec')} htmlFor={`l${i}-spec`} hint={t('slip.spec.hint')}>
                    <Input id={`l${i}-spec`} {...register(`lines.${i}.spec`)} />
                  </Field>
                  {auth.canSeeFinance && (
                    <Field label={t('slip.rate')} htmlFor={`l${i}-rate`}>
                      <Controller control={control} name={`lines.${i}.est_rate`} render={({ field }) => (
                        <MoneyInput id={`l${i}-rate`} value={field.value} onChange={field.onChange} />
                      )} />
                    </Field>
                  )}
                  <Field label={t('common.note')} htmlFor={`l${i}-note`}><Input id={`l${i}-note`} {...register(`lines.${i}.note`)} /></Field>
                </div>
              </MoreDetails>
            </Card>
          )
        })}
        <div>
          <Button type="button" variant="secondary"
            onClick={() => lines.append(emptyLine(form.getValues('lines').at(-1)?.project_id))}>
            {t('slip.addLine')}
          </Button>
        </div>

        <Card title={t('slip.delivery')}>
          <More label={t('slip.delivery.more')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('slip.contact')} htmlFor="slip-contact" hint={t('slip.contact.hint')}>
                <Input id="slip-contact" inputMode="tel" data-default={watch('site_contact') === (auth.profile?.phone ?? '')} {...register('site_contact')} />
              </Field>
              <Field label={t('slip.instructions')} htmlFor="slip-instr" hint={t('slip.instructions.hint')}>
                <Input id="slip-instr" {...register('delivery_instructions')} />
              </Field>
              {/* Older slips may have a separate note; new ones use the instructions only. */}
              {initial?.notes && <Field label={t('slip.notes')} htmlFor="slip-notes"><Input id="slip-notes" {...register('notes')} /></Field>}
            </div>
          </More>
        </Card>

        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending && save.variables?.submit}>
            {auth.company.slip_approval_required ? t('slip.submit.approval') : t('slip.submit')}
          </Button>
          <Button type="button" variant="secondary" busy={save.isPending && !save.variables?.submit} onClick={() => run(false)}>
            {t('common.saveDraft')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
        </FormActions>
      </form>
    </>
  )
}
