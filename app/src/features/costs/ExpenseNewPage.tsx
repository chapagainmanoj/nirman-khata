// Enter an other expense (req §15): equipment hire, transport, fuel, khaja, permits, small
// purchases. On a project: pick a payee or type a new one; "paid now" records the payment in the
// same step without counting the cost twice, and cash paid on the spot needs no name (the Cash
// payee). For the company (a Company Expense): a record only, already paid, no cost on any
// project; chosen explicitly, never because no project was picked. Id and operation key stay
// with the draft.
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, ButtonLink, Card, Checkbox, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select } from '../../components/ui'
import { useSimpleForms } from '../../auth/useSimpleForms'
import { More } from '../../components/More'
import { revealField } from '../../lib/forms'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PAYMENT_METHODS } from '../../lib/labels'
import { t } from '../../lib/i18n'
import { formatNPR, parseNPR } from '../../lib/money'
import { useHeadings, useProjects } from '../projects/api'
import { projectCrumbs } from '../projects/crumbs'
import { projectChoices, useWorkingOnDefault } from '../projects/current'
import { rpc, useRefreshMoney } from '../supply/api'
import { canRecordPayments } from '../supply/permissions'
import { usePayees } from './api'

type Values = {
  /** A project expense, or a company expense (no project, record only). */
  scope: 'project' | 'company'
  id: string
  op_key: string
  project_id: string
  heading_id: string
  expense_date: string
  amount: string
  description: string
  payee_name: string
  payee_kind: string
  bill_no: string
  pay_now: boolean
  method: keyof typeof PAYMENT_METHODS
  reference: string
}

type Saved = { expense_id: string; payment: { number: string } | null; amount: number; project_id: string; company: boolean }

export function ExpenseNewPage() {
  const auth = useCompany()
  const simple = useSimpleForms()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const headings = useHeadings(auth.companyId)
  const payees = usePayees(auth.companyId)
  const refresh = useRefreshMoney()
  const mayPay = canRecordPayments(auth)
  const listId = useId()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Saved | null>(null)

  // Site expenses by default; materials are bought with slips and bills.
  const siteHeading = headings.data?.find((h) => h.kind === 'site' && !h.parent_id)?.id ?? ''
  const fresh = (): Values => ({
    scope: params.get('for') === 'company' ? 'company' : 'project', id: newId(), op_key: newId(), project_id: params.get('project') ?? '', heading_id: '', expense_date: todayKathmandu(),
    amount: '', description: '', payee_name: '', payee_kind: '', bill_no: '', pay_now: mayPay, method: 'cash', reference: '',
  })
  const form = useForm<Values>({ defaultValues: fresh() })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'expense-new' })
  const { register, control, watch, getValues } = form
  const v = watch()
  // No project in the link: start on the Working on project.
  useWorkingOnDefault(v.project_id, (id) => form.setValue('project_id', id), params.has('project'))
  const company = v.scope === 'company'
  const headingId = v.heading_id || siteHeading
  const known = payees.data?.find((p) => p.name.trim().toLowerCase() === v.payee_name.trim().toLowerCase())
  // Cash paid on the spot needs no name: the server files it under the Cash payee.
  const payeeOptional = mayPay && v.pay_now
  const choices = headings.data?.filter((h) => h.active && h.kind !== 'materials') ?? []
  const name = (h: { name: string; parent_id: string | null }) => {
    const parent = headings.data?.find((x) => x.id === h.parent_id)
    return parent ? `${parent.name} › ${h.name}` : h.name
  }
  const chosenHeading = choices.find((h) => h.id === headingId)
  // Simple forms fold the heading only when the form can fill it in (the site heading exists).
  const foldHeading = simple && !!siteHeading
  const headingName = chosenHeading && name(chosenHeading)

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      const forCompany = vals.scope === 'company'
      const common = {
        id: vals.id, heading_id: vals.heading_id || siteHeading, expense_date: vals.expense_date,
        amount_paisa: parseNPR(vals.amount), description: vals.description.trim(), bill_no: vals.bill_no.trim() || null,
      }
      const r = await rpc('save_expense', { p_op_key: vals.op_key, p_expense: forCompany
        ? { ...common, company_id: auth.companyId, pay_now: { method: vals.method } }
        : {
            ...common, project_id: vals.project_id,
            ...(known ? { payee_id: known.id } : vals.payee_name.trim() ? { payee: { name: vals.payee_name.trim(), kind: vals.payee_kind.trim() || null } } : {}),
            pay_now: vals.pay_now ? { method: vals.method, reference: vals.reference.trim() || null } : null,
          } })
      return { ...(r as unknown as Saved), amount: parseNPR(vals.amount) ?? 0, project_id: forCompany ? '' : vals.project_id, company: forCompany }
    },
    onSuccess: async (r) => {
      await draft.clear()
      await refresh()
      setSaved(r)
    },
  })

  function submit() {
    const vals = getValues()
    const forCompany = vals.scope === 'company'
    const problem =
      !forCompany && !vals.project_id ? t('expenseNew.chooseTheProject')
      : !(parseNPR(vals.amount) ?? 0) ? t('expenseNew.enterTheAmount')
      : !vals.description.trim() ? t('expenseNew.sayWhatItWas')
      : !forCompany && !vals.payee_name.trim() && !(mayPay && vals.pay_now) ? t('expenseNew.chooseOrTypeWho')
      : !headingId ? t('expenseNew.chooseACostHeading')
      : vals.expense_date > todayKathmandu() ? t('expenseNew.theDateCannotBe')
      : ''
    setError(problem)
    if (problem === t('expenseNew.chooseACostHeading')) revealField('ex-heading')
    if (!problem) save.mutate(vals)
  }

  if (saved) {
    return (
      <>
        <PageHeader title={saved.company ? t('expenseNew.companyExpenseSaved') : t('expenseNew.otherExpenseSaved')}
          crumbs={saved.company ? [{ to: '/expenses', label: t('nav.expenses') }] : projectCrumbs(projects.data, saved.project_id)} />
        <Card>
          <p className="text-sm">
            {t('expenseNew.amountForDescriptionValue', { amount: formatNPR(saved.amount), description: v.description, value: ' ' })}{saved.company ? t('expenseNew.keptAsACompany')
              : saved.payment ? t('expenseNew.paidNowNumber', { number: saved.payment.number }) : t('expenseNew.notPaidYetIt')}
          </p>
          <div className="mt-3"><Attachments owner={{ expense_id: saved.expense_id }} canAdd label={t('expenseNew.addReceiptPhoto')} /></div>
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => { form.reset({ ...fresh(), scope: saved.company ? 'company' : 'project', project_id: saved.project_id }); setSaved(null) }}>{t('expenseNew.enterAnother')}</Button>
          {saved.company
            ? <ButtonLink variant="secondary" to="/expenses">{t('nav.expenses')}</ButtonLink>
            : <ButtonLink variant="secondary" to={`/projects/${saved.project_id}`}>{t('expenseNew.backToProject')}</ButtonLink>}
        </div>
      </>
    )
  }

  const headingField = (
    <Field label={t('expenseNew.costHeading')} htmlFor="ex-heading">
      <Select id="ex-heading" value={headingId} data-default={!v.heading_id} onChange={(e) => form.setValue('heading_id', e.target.value)}>
        <option value="">{t('expenseNew.chooseHeading')}</option>
        {choices.map((h) => <option key={h.id} value={h.id}>{name(h)}</option>)}
      </Select>
    </Field>
  )

  return (
    <>
      <PageHeader title={t('expenseNew.enterOtherExpense')} crumbs={company ? [{ to: '/expenses', label: t('nav.expenses') }] : projectCrumbs(projects.data, v.project_id)}
        subtitle={t('expenseNew.equipmentHireTransportFuel')} />
      {draft.restoredAt && <div className="mb-4"><Notice>{t('expenseNew.restoredAnOtherExpense')}</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium text-ink">{t('expenses.for')}</legend>
              <div className="flex flex-wrap gap-x-6">
                {(['project', 'company'] as const).map((s) => (
                  <label key={s} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input type="radio" name="ex-scope" className="size-5 shrink-0 accent-brand" checked={v.scope === s}
                      onChange={() => form.setValue('scope', s, { shouldDirty: true })} />
                    <span className="text-sm font-medium text-ink">{t(s === 'project' ? 'expenses.for.project' : 'expenses.for.company')}</span>
                  </label>
                ))}
              </div>
              {company && <p className="mt-1 text-sm text-subtle">{t('expenses.for.companyHint')}</p>}
            </fieldset>
            {!company && (
              <Field label={t('expenseNew.project')} htmlFor="ex-project">
                <Select id="ex-project" value={watch('project_id')} onChange={(e) => form.setValue('project_id', e.target.value, { shouldDirty: true })}>
                  <option value="">{t('common.project.choose')}</option>
                  {projectChoices(projects.data, 'money').map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label={t('expenseNew.amount')} htmlFor="ex-amount">
              <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="ex-amount" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label={t('expenseNew.whatFor')} htmlFor="ex-desc" hint={t('expenseNew.eg.jcb4Hours')}>
              <Input id="ex-desc" {...register('description')} />
            </Field>
            {!foldHeading && headingField}
            <Field label={t('expenseNew.date')} htmlFor="ex-date">
              <Controller control={control} name="expense_date" render={({ field }) => (
                <DateInput id="ex-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            {!company && (
              <Field label={t('expenseNew.paidTo')} htmlFor="ex-payee"
                hint={v.payee_name.trim() && !known ? t('expenseNew.newNameItWill') : payeeOptional ? t('expenses.payee.optional') : t('expenseNew.pickFromTheList')}>
                <Input id="ex-payee" list={listId} autoComplete="off" {...register('payee_name')} />
                <datalist id={listId}>
                  {payees.data?.filter((p) => p.active && !p.is_cash).map((p) => <option key={p.id} value={p.name}>{p.kind ?? ''}</option>)}
                </datalist>
              </Field>
            )}
            <More className="sm:col-span-2" summary={[foldHeading && headingName, v.bill_no && `bill ${v.bill_no}`].filter(Boolean).join(', ') || undefined}>
              {foldHeading && headingField}
              {!company && v.payee_name.trim() && !known && (
                <Field label={t('expenseNew.typeOfService')} htmlFor="ex-payee-kind" hint={t('expenseNew.optionalEGJcb')}>
                  <Input id="ex-payee-kind" {...register('payee_kind')} />
                </Field>
              )}
              <Field label={t('expenseNew.billNumber')} htmlFor="ex-bill" hint={t('common.optional')}><Input id="ex-bill" {...register('bill_no')} /></Field>
            </More>
          </div>
        </Card>

        {company ? (
          <Card>
            <Field label={t('expenseNew.howItWasPaid')} htmlFor="ex-method">
              <Select id="ex-method" {...register('method')}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
          </Card>
        ) : mayPay && (
          <Card>
            <Checkbox label={t('expenseNew.paidNow')} hint={t('expenseNew.recordsThePaymentToo')} {...register('pay_now')} />
            {v.pay_now && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t('expenseNew.how')} htmlFor="ex-method">
                  <Select id="ex-method" {...register('method')}>
                    {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </Select>
                </Field>
                {v.method !== 'cash' && <Field label={t('expenseNew.reference')} htmlFor="ex-ref" hint={t('common.optional')}><Input id="ex-ref" {...register('reference')} /></Field>}
              </div>
            )}
          </Card>
        )}

        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending}>{company ? t('expenseNew.saveCompanyExpense') : t('expenseNew.saveOtherExpense')}</Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>{t('common.cancel')}</Button>
        </FormActions>
      </form>
    </>
  )
}
