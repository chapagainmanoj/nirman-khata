// Enter another project expense (req §15): equipment hire, transport, fuel, khaja, permits,
// small purchases. Pick a payee or type a new one; "paid now" records the payment in the
// same step without counting the cost twice. Id and operation key stay with the draft.
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { Attachments } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, ButtonLink, Card, Checkbox, ErrorBanner, Field, Input, Notice, PageHeader, Select } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, parseNPR } from '../../lib/money'
import { useHeadings, useProjects } from '../projects/api'
import { rpc, useRefreshMoney } from '../supply/api'
import { canRecordPayments } from '../supply/permissions'
import { usePayees } from './api'

type Values = {
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

type Saved = { expense_id: string; payment: { number: string } | null; amount: number; project_id: string }

export function ExpenseNewPage() {
  const auth = useCompany()
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
    id: newId(), op_key: newId(), project_id: params.get('project') ?? '', heading_id: '', expense_date: todayKathmandu(),
    amount: '', description: '', payee_name: '', payee_kind: '', bill_no: '', pay_now: mayPay, method: 'cash', reference: '',
  })
  const form = useForm<Values>({ defaultValues: fresh() })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'expense-new' })
  const { register, control, watch, getValues } = form
  const v = watch()
  const headingId = v.heading_id || siteHeading
  const known = payees.data?.find((p) => p.name.trim().toLowerCase() === v.payee_name.trim().toLowerCase())
  const choices = headings.data?.filter((h) => h.active && h.kind !== 'materials') ?? []
  const name = (h: { name: string; parent_id: string | null }) => {
    const parent = headings.data?.find((x) => x.id === h.parent_id)
    return parent ? `${parent.name} › ${h.name}` : h.name
  }

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      const r = await rpc('save_expense', { p_op_key: vals.op_key, p_expense: {
        id: vals.id, project_id: vals.project_id, heading_id: vals.heading_id || siteHeading, expense_date: vals.expense_date,
        amount_paisa: parseNPR(vals.amount), description: vals.description.trim(), bill_no: vals.bill_no.trim() || null,
        ...(known ? { payee_id: known.id } : { payee: { name: vals.payee_name.trim(), kind: vals.payee_kind.trim() || null } }),
        pay_now: vals.pay_now ? { method: vals.method, reference: vals.reference.trim() || null } : null,
      } })
      return { ...(r as unknown as Saved), amount: parseNPR(vals.amount) ?? 0, project_id: vals.project_id }
    },
    onSuccess: async (r) => {
      await draft.clear()
      await refresh()
      setSaved(r)
    },
  })

  function submit() {
    const vals = getValues()
    const problem =
      !vals.project_id ? 'Choose the project.'
      : !(parseNPR(vals.amount) ?? 0) ? 'Enter the amount.'
      : !vals.description.trim() ? 'Say what it was for, e.g. JCB 4 hours.'
      : !vals.payee_name.trim() ? 'Choose or type who was paid.'
      : !headingId ? 'Choose a cost heading.'
      : vals.expense_date > todayKathmandu() ? 'The date cannot be in the future.'
      : ''
    setError(problem)
    if (!problem) save.mutate(vals)
  }

  if (saved) {
    return (
      <>
        <PageHeader title="Expense saved" />
        <Card>
          <p className="text-sm">
            {formatNPR(saved.amount)} for {v.description}. {saved.payment ? `Paid now (${saved.payment.number}).` : 'Not paid yet; it shows as owed to the payee.'}
          </p>
          <div className="mt-3"><Attachments owner={{ expense_id: saved.expense_id }} canAdd label="Add receipt photo" /></div>
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => { form.reset({ ...fresh(), project_id: saved.project_id }); setSaved(null) }}>Enter another</Button>
          <ButtonLink variant="secondary" to={`/projects/${saved.project_id}`}>Back to project</ButtonLink>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Enter expense" subtitle="Equipment hire, transport, fuel, khaja, permits, small purchases." />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored an expense you had not saved. Check it was not already entered.</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project" htmlFor="ex-project">
              <Select id="ex-project" {...register('project_id')}>
                <option value="">Choose project</option>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount" htmlFor="ex-amount">
              <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="ex-amount" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="What for" htmlFor="ex-desc" hint="e.g. JCB 4 hours, diesel 20 L, khaja for crew">
              <Input id="ex-desc" {...register('description')} />
            </Field>
            <Field label="Cost heading" htmlFor="ex-heading">
              <Select id="ex-heading" value={headingId} onChange={(e) => form.setValue('heading_id', e.target.value)}>
                <option value="">Choose heading</option>
                {choices.map((h) => <option key={h.id} value={h.id}>{name(h)}</option>)}
              </Select>
            </Field>
            <Field label="Date" htmlFor="ex-date">
              <Controller control={control} name="expense_date" render={({ field }) => (
                <DateInput id="ex-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            <Field label="Paid to" htmlFor="ex-payee" hint={v.payee_name.trim() && !known ? 'New payee; it will be added.' : 'Pick from the list or type a new name'}>
              <Input id="ex-payee" list={listId} autoComplete="off" {...register('payee_name')} />
              <datalist id={listId}>
                {payees.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.name}>{p.kind ?? ''}</option>)}
              </datalist>
            </Field>
            {v.payee_name.trim() && !known && (
              <Field label="Payee type" htmlFor="ex-payee-kind" hint="Optional, e.g. JCB owner, transporter, shop">
                <Input id="ex-payee-kind" {...register('payee_kind')} />
              </Field>
            )}
            <Field label="Bill number" htmlFor="ex-bill" hint="Optional"><Input id="ex-bill" {...register('bill_no')} /></Field>
          </div>
        </Card>

        {mayPay && (
          <Card>
            <Checkbox label="Paid now" hint="Records the payment too. The cost is counted once." {...register('pay_now')} />
            {v.pay_now && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="How" htmlFor="ex-method">
                  <Select id="ex-method" {...register('method')}>
                    {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </Select>
                </Field>
                <Field label="Reference" htmlFor="ex-ref" hint="Optional"><Input id="ex-ref" {...register('reference')} /></Field>
              </div>
            )}
          </Card>
        )}

        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={save.isPending}>Save expense</Button>
          <Button type="button" variant="secondary" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
        </div>
      </form>
    </>
  )
}
