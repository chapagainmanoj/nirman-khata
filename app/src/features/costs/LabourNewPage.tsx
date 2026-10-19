// Enter own labour cost (req §14): per project per work date, for a crew, without worker
// names. A week (or any range) makes one daily record per date (acceptance #18). "Pay now"
// records the payment in the same step without counting the cost twice (I-8, acceptance #8).
// The entry id and operation key stay with the device draft until the server confirms.
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateInput, DateText } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, ButtonLink, Card, Checkbox, ErrorBanner, Field, FormActions, Input, MoreDetails, Notice, PageHeader, Select } from '../../components/ui'
import { addDays, dateRange, todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PAYMENT_METHODS, WORK_TYPES } from '../../lib/labels'
import { formatNPR, paisaToInput, parseNPR, splitEvenly } from '../../lib/money'
import { useProjects } from '../projects/api'
import { projectCrumbs } from '../projects/crumbs'
import { projectChoices, useWorkingOnDefault } from '../projects/current'
import { rpc, useRefreshMoney } from '../supply/api'
import { canRecordPayments } from '../supply/permissions'
import { useCrews } from './api'
import { t } from '../../lib/i18n'

type Values = {
  id: string
  op_key: string
  mode: 'day' | 'week'
  project_id: string
  crew_id: string
  work_date: string
  from_date: string
  to_date: string
  work_type: string
  description: string
  headcount: string
  person_days: string
  rate: string
  amount: string
  total: string
  each: boolean
  day_amounts: Record<string, string>
  pay_now: boolean
  method: keyof typeof PAYMENT_METHODS
  reference: string
}

type Saved = { labour_cost_ids: string[]; total_paisa: number; payment: { number: string } | null; days: number }

export function LabourNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const crews = useCrews(auth.companyId)
  const refresh = useRefreshMoney()
  const mayPay = canRecordPayments(auth)
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)
  const today = todayKathmandu()

  const fresh = (): Values => ({
    id: newId(), op_key: newId(), mode: 'day', project_id: params.get('project') ?? '', crew_id: params.get('crew') ?? '',
    work_date: today, from_date: addDays(today, -6), to_date: today, work_type: t('labourNew.mixed'), description: '',
    headcount: '', person_days: '', rate: '', amount: '', total: '', each: false, day_amounts: {},
    pay_now: mayPay, method: 'cash', reference: '',
  })
  const form = useForm<Values>({ defaultValues: fresh() })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'labour-new' })
  const { register, control, watch, setValue, getValues } = form
  // No project or crew in the link: start on the Working on project. (A crew link: its project.)
  useWorkingOnDefault(watch('project_id'), (id) => setValue('project_id', id), params.has('project') || params.has('crew'))
  const v = watch()

  const crewOptions = crews.data?.filter((c) => (c.active || c.id === v.crew_id) && (!c.project_id || c.project_id === v.project_id)) ?? []
  // The project's default crew, unless a crew for this project is already chosen.
  useEffect(() => {
    if (!v.project_id || !crews.data) return
    if (crewOptions.some((c) => c.id === v.crew_id)) return
    const def = crews.data.find((c) => c.project_id === v.project_id && c.is_default)
    if (def) setValue('crew_id', def.id)
  }, [v.project_id, crews.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = v.mode === 'week' ? dateRange(v.from_date, v.to_date) : [v.work_date]
  const split = splitEvenly(parseNPR(v.total) ?? 0, days.length)
  const dayAmount = (d: string, i: number) => (v.each ? parseNPR(v.day_amounts[d] ?? '') ?? 0 : split[i])
  const weekTotal = days.reduce((s, d, i) => s + dayAmount(d, i), 0)

  function recalc(pd: string, rate: string) {
    const r = parseNPR(rate)
    const n = Number(pd)
    if (r !== null && n > 0) setValue('amount', paisaToInput(Math.round(r * n)))
  }

  const save = useMutation({
    mutationFn: async ({ vals, confirm }: { vals: Values; confirm: boolean }) => {
      const pay_now = vals.pay_now ? { method: vals.method, reference: vals.reference.trim() || null } : null
      const common = {
        id: vals.id, project_id: vals.project_id, crew_id: vals.crew_id || null, work_type: vals.work_type.trim() || null,
        description: vals.description.trim() || null, pay_now, confirm_duplicate: confirm,
      }
      const r = vals.mode === 'day'
        ? await rpc('save_labour_cost', { p_op_key: vals.op_key, p_entry: {
            ...common, work_date: vals.work_date, amount_paisa: parseNPR(vals.amount),
            headcount: Number(vals.headcount) || null, person_days: Number(vals.person_days) || null, rate_paisa: parseNPR(vals.rate),
          } })
        : await rpc('save_labour_batch', { p_op_key: vals.op_key, p_batch: {
            ...common, from_date: vals.from_date, to_date: vals.to_date, headcount: Number(vals.headcount) || null,
            ...(vals.each
              ? { days: days.map((d, i) => ({ work_date: d, amount_paisa: dayAmount(d, i) })).filter((d) => d.amount_paisa > 0) }
              : { total_paisa: parseNPR(vals.total) }),
          } })
      return { ...(r as unknown as Saved), days: vals.mode === 'day' ? 1 : days.length }
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
      !vals.project_id ? t('labourNew.chooseTheProject')
      : !vals.crew_id ? t('labourNew.chooseTheCrew')
      : vals.mode === 'day' && !(parseNPR(vals.amount) ?? 0) ? t('labourNew.enterTheLabourCost')
      : vals.mode === 'day' && vals.work_date > today ? t('labourNew.labourCannotBeEntered')
      : vals.mode === 'week' && days.length === 0 ? t('labourNew.theLastDayIs')
      : vals.mode === 'week' && days.length > 31 ? t('labourNew.enterUpTo31')
      : vals.mode === 'week' && vals.to_date > today ? t('labourNew.labourCannotBeEntered')
      : vals.mode === 'week' && weekTotal <= 0 ? t('labourNew.enterTheTotalFor')
      : ''
    setError(problem)
    if (!problem) save.mutate({ vals, confirm })
  }

  if (saved) {
    return (
      <>
        <PageHeader title={t('labourNew.labourSaved')} crumbs={projectCrumbs(projects.data, v.project_id)} />
        <Card>
          <p className="text-sm">
            {saved.days === 1 ? t('labourNew.oneDay') : t('labourNew.lengthDays', { length: saved.labour_cost_ids.length })} {t('labourNew.ofLabourTotalValue', { total: formatNPR(saved.total_paisa), value: ' ' })}{saved.payment ? t('labourNew.paidNowNumber', { number: saved.payment.number }) : t('labourNew.notPaidYetIt')}
          </p>
          {saved.labour_cost_ids.length === 1 && (
            <div className="mt-3">
              <Attachments owner={{ labour_cost_id: saved.labour_cost_ids[0] }} canAdd label={t('labourNew.addPhotoAttendanceSheet')} />
            </div>
          )}
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => { form.reset({ ...fresh(), project_id: v.project_id, crew_id: v.crew_id }); setSaved(null) }}>{t('labourNew.enterMore')}</Button>
          {v.project_id && <ButtonLink variant="secondary" to={`/projects/${v.project_id}`}>{t('labourNew.backToProject')}</ButtonLink>}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('labourNew.enterLabour')} crumbs={projectCrumbs(projects.data, v.project_id)} subtitle={t('labourNew.dailyCostForA')} />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('labourNew.restoredLabourYouHad')}</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('labourNew.project')} htmlFor="lb-project">
              <Select id="lb-project" value={watch('project_id')} onChange={(e) => form.setValue('project_id', e.target.value, { shouldDirty: true })}>
                <option value="">{t('common.project.choose')}</option>
                {projectChoices(projects.data, 'money').map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label={t('labourNew.crew')} htmlFor="lb-crew">
              <Select id="lb-crew" value={watch('crew_id')} onChange={(e) => form.setValue('crew_id', e.target.value, { shouldDirty: true })}>
                <option value="">{t('labourNew.chooseCrew')}</option>
                {crewOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t('labourNew.work')} htmlFor="lb-type">
              <Select id="lb-type" {...register('work_type')}>
                {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
            <Field label={t('labourNew.whatWasDone')} htmlFor="lb-desc" hint={t('labourNew.optionalEGSlab')}><Input id="lb-desc" {...register('description')} /></Field>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex gap-1 rounded-lg bg-track p-1" role="radiogroup" aria-label={t('labourNew.oneDayOrSeveral')}>
            {([['day', t('labourNew.oneDay')], ['week', t('labourNew.severalDays')]] as const).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={v.mode === k} onClick={() => setValue('mode', k)}
                className={`min-h-11 flex-1 rounded-md px-1 text-sm font-medium ${v.mode === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle'}`}>
                {label}
              </button>
            ))}
          </div>
          {v.mode === 'day' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('labourNew.workDate')} htmlFor="lb-date">
                <Controller control={control} name="work_date" render={({ field }) => (
                  <DateInput id="lb-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
                )} />
              </Field>
              <Field label={t('labourNew.labourCostForThe')} htmlFor="lb-amount">
                <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="lb-amount" value={field.value} onChange={field.onChange} />} />
              </Field>
              <Field label={t('labourNew.people')} htmlFor="lb-head" hint={t('common.optional')}><Input id="lb-head" inputMode="numeric" {...register('headcount')} /></Field>
              <div className="sm:col-span-2">
                <MoreDetails summary={t('labourNew.personDaysAndRate')} open={!!(v.person_days || v.rate)}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('labourNew.personDays')} htmlFor="lb-pd" hint={t('labourNew.eg.65')}>
                      <Input id="lb-pd" inputMode="decimal" {...register('person_days', { onChange: (e) => recalc(e.target.value, getValues('rate')) })} />
                    </Field>
                    <Field label={t('labourNew.ratePerDay')} htmlFor="lb-rate">
                      <Controller control={control} name="rate" render={({ field }) => (
                        <MoneyInput id="lb-rate" value={field.value} onChange={(e) => { field.onChange(e); recalc(getValues('person_days'), e.target.value) }} />
                      )} />
                    </Field>
                  </div>
                </MoreDetails>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('labourNew.firstDay')} htmlFor="lb-from">
                  <Controller control={control} name="from_date" render={({ field }) => (
                    <DateInput id="lb-from" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
                  )} />
                </Field>
                <Field label={t('labourNew.lastDay')} htmlFor="lb-to">
                  <Controller control={control} name="to_date" render={({ field }) => (
                    <DateInput id="lb-to" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
                  )} />
                </Field>
                <Field label={t('labourNew.peopleEachDay')} htmlFor="lb-head-w" hint={t('common.optional')}><Input id="lb-head-w" inputMode="numeric" {...register('headcount')} /></Field>
                {!v.each && (
                  <Field label={t('labourNew.totalForTheseDays')} htmlFor="lb-total" hint={t('labourNew.splitEquallyOverThe')}>
                    <Controller control={control} name="total" render={({ field }) => <MoneyInput id="lb-total" value={field.value} onChange={field.onChange} />} />
                  </Field>
                )}
              </div>
              <div className="mt-3">
                <Checkbox label={t('labourNew.differentAmountOnSome')} hint={t('labourNew.eg.aDayOff')} checked={v.each}
                  onChange={(e) => {
                    if (e.target.checked) setValue('day_amounts', Object.fromEntries(days.map((d, i) => [d, paisaToInput(split[i])])))
                    setValue('each', e.target.checked)
                  }} />
              </div>
              {days.length > 0 && days.length <= 31 && (
                <ul className="mt-3">
                  {days.map((d, i) => (
                    <li key={d} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
                      <span><DateText value={d} display={auth.dateDisplay} /></span>
                      {v.each ? (
                        <span className="w-36">
                          <MoneyInput aria-label={t('labourNew.amountOnD', { d })} value={v.day_amounts[d] ?? ''}
                            onChange={(e) => setValue('day_amounts', { ...getValues('day_amounts'), [d]: e.target.value })} />
                        </span>
                      ) : (
                        <span className="tabular-nums">{formatNPR(split[i])}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-sm text-subtle">
                {t('labourNew.lengthDay', { length: days.length })}{days.length === 1 ? '' : 's'}{t('labourNew.weektotalInAllEach', { weekTotal: formatNPR(weekTotal) })}</p>
            </>
          )}
        </Card>

        {mayPay && (
          <Card>
            <Checkbox label={t('labourNew.paidNow')} hint={t('labourNew.recordsThePaymentToo')} {...register('pay_now')} />
            {v.pay_now && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t('labourNew.how')} htmlFor="lb-method">
                  <Select id="lb-method" {...register('method')}>
                    {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </Select>
                </Field>
                {v.method !== 'cash' && <Field label={t('labourNew.reference')} htmlFor="lb-ref" hint={t('common.optional')}><Input id="lb-ref" {...register('reference')} /></Field>}
              </div>
            )}
          </Card>
        )}

        {duplicate && (
          <Notice>
            <span className="block">{t('labourNew.valueIsThisA', { value: duplicate.charAt(0).toUpperCase() + duplicate.slice(1) })}</span>
            <span className="mt-2 flex flex-wrap gap-2">
              <Button type="button" busy={save.isPending} onClick={() => submit(true)}>{t('labourNew.yesSaveItToo')}</Button>
              <Button type="button" variant="secondary" onClick={() => setDuplicate('')}>{t('labourNew.noCheckFirst')}</Button>
            </span>
          </Notice>
        )}
        <ErrorBanner>{error || (!duplicate && save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending}>{t('labourNew.saveLabour')}</Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>{t('common.cancel')}</Button>
        </FormActions>
      </form>
    </>
  )
}
