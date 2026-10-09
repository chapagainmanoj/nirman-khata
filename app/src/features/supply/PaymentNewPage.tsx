// Record a supplier payment (req §12.1). Optional split by project, optional matching to bills.
// The payment id and operation key stay with the device draft until the server confirms,
// so a retry after a lost connection never records it twice (acceptance #13).
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Notice, PageHeader, Select } from '../../components/ui'
import { todayKathmandu } from '../../lib/dates'
import { useFormDraft } from '../../lib/drafts'
import { friendlyError } from '../../lib/errors'
import { newId } from '../../lib/ids'
import { PAYMENT_METHODS } from '../../lib/labels'
import { formatNPR, paisaToInput, parseNPR } from '../../lib/money'
import { useProjects } from '../projects/api'
import { rpc, useOpenItems, useRefreshMoney, useSuppliers } from './api'
import { canPost } from './permissions'

type Values = {
  id: string
  op_key: string
  supplier_id: string
  payment_date: string
  amount: string
  method: keyof typeof PAYMENT_METHODS
  reference: string
  notes: string
  allocations: Array<{ project_id: string; amount: string }>
  settle: Record<string, string> // "billId:projectId" -> amount
}

export function PaymentNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const suppliers = useSuppliers(auth.companyId)
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [error, setError] = useState('')
  const accounts = canPost(auth)

  const form = useForm<Values>({
    defaultValues: {
      id: newId(), op_key: newId(), supplier_id: params.get('supplier') ?? '', payment_date: todayKathmandu(), amount: '',
      method: 'cash', reference: '', notes: '', allocations: [], settle: {},
    },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'payment-new' })
  const allocations = useFieldArray({ control: form.control, name: 'allocations' })
  const { register, control, watch, setValue, getValues } = form
  const v = watch()
  const openItems = useOpenItems(v.supplier_id, !!v.supplier_id)
  const openBills = openItems.data?.filter((i) => i.kind === 'bill') ?? []

  // Coming from a bill: allocate to its projects and match it.
  const fromBill = params.get('bill')
  useEffect(() => {
    if (!fromBill || !openItems.data || getValues('allocations').length) return
    const rows = openBills.filter((b) => b.doc_id === fromBill)
    if (!rows.length) return
    setValue('allocations', rows.map((r) => ({ project_id: r.project_id!, amount: paisaToInput(r.amount_paisa) })))
    setValue('settle', Object.fromEntries(rows.map((r) => [`${r.doc_id}:${r.project_id}`, paisaToInput(r.amount_paisa)])))
    setValue('amount', paisaToInput(rows.reduce((s, r) => s + r.amount_paisa, 0)))
  }, [fromBill, openItems.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Single project and nothing split yet: the whole payment goes to it.
  const visible = projects.data ?? []
  const amountPaisa = parseNPR(v.amount)
  const allocated = v.allocations.reduce((s, a) => s + (parseNPR(a.amount) ?? 0), 0)
  const unallocated = (amountPaisa ?? 0) - allocated

  // Only bills shown now count: ticks left behind by a supplier or project change are ignored.
  const shownSettle = (vals: Values) => {
    const shown = new Set(openBills.filter((b) => vals.allocations.some((a) => a.project_id === b.project_id)).map((b) => `${b.doc_id}:${b.project_id}`))
    return Object.entries(vals.settle).filter(([k, a]) => shown.has(k) && (parseNPR(a) ?? 0) > 0)
  }

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      const settlements = shownSettle(vals)
        .map(([key, a]) => { const [bill_id, project_id] = key.split(':'); return { bill_id, project_id, amount_paisa: parseNPR(a) } })
      return rpc('record_payment', { p_op_key: vals.op_key, p_payment: {
        id: vals.id, supplier_id: vals.supplier_id, payment_date: vals.payment_date, amount_paisa: parseNPR(vals.amount),
        method: vals.method, reference: vals.reference || null, notes: vals.notes || null,
        allocations: vals.allocations.filter((a) => (parseNPR(a.amount) ?? 0) > 0).map((a) => ({ project_id: a.project_id, amount_paisa: parseNPR(a.amount) })),
        settlements,
      } })
    },
    onSuccess: async (_r, vals) => {
      await draft.clear()
      await refresh()
      navigate(`/payments/${vals.id}`, { replace: true })
    },
  })

  function submit() {
    const vals = getValues()
    const settleSum = (projectId: string) => shownSettle(vals)
      .filter(([k]) => k.endsWith(`:${projectId}`)).reduce((s, [, a]) => s + (parseNPR(a) ?? 0), 0)
    const problem =
      !vals.supplier_id ? 'Choose the supplier.'
      : !amountPaisa || amountPaisa <= 0 ? 'Enter the amount paid.'
      : vals.allocations.some((a) => !a.project_id || parseNPR(a.amount) === null) ? 'Each project split needs a project and an amount.'
      : new Set(vals.allocations.map((a) => a.project_id)).size !== vals.allocations.length ? 'A project is listed twice.'
      : allocated > amountPaisa ? 'The project split is more than the payment.'
      : !accounts && allocated !== amountPaisa ? 'Split the whole payment across your projects.'
      : vals.allocations.some((a) => settleSum(a.project_id) > (parseNPR(a.amount) ?? 0)) ? 'Bills matched for a project are more than that project\'s share.'
      : ''
    setError(problem)
    if (!problem) save.mutate(vals)
  }

  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code ?? ''

  return (
    <>
      <PageHeader title="Record payment" subtitle="Payments reduce what you owe. They are never project cost." />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored a payment you had not saved. Check it was not already recorded.</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier" htmlFor="p-supplier">
              <Select id="p-supplier" {...register('supplier_id')}>
                <option value="">Choose supplier</option>
                {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Amount paid" htmlFor="p-amount">
              <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="p-amount" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Paid on" htmlFor="p-date">
              <Controller control={control} name="payment_date" render={({ field }) => (
                <DateInput id="p-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            <Field label="How" htmlFor="p-method">
              <Select id="p-method" {...register('method')}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Reference" htmlFor="p-ref" hint="Cheque number, transaction id"><Input id="p-ref" {...register('reference')} /></Field>
            <Field label="Notes" htmlFor="p-notes"><Input id="p-notes" {...register('notes')} /></Field>
          </div>
        </Card>

        <Card title="Which project is it for?">
          <p className="mb-3 text-sm text-subtle">
            {accounts
              ? 'Optional. Anything not split to a project stays "not assigned" until you assign it.'
              : 'Split the whole payment across your projects.'}
          </p>
          {allocations.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field label="Project" htmlFor={`pa${i}-p`}>
                <Select id={`pa${i}-p`} {...register(`allocations.${i}.project_id`)}>
                  <option value="">Choose</option>
                  {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
              <Field label="Amount" htmlFor={`pa${i}-a`}>
                <Controller control={control} name={`allocations.${i}.amount`} render={({ field }) => (
                  <MoneyInput id={`pa${i}-a`} value={field.value} onChange={field.onChange} />
                )} />
              </Field>
              <Button type="button" variant="ghost" aria-label="Remove project" onClick={() => allocations.remove(i)}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="secondary"
            onClick={() => allocations.append({ project_id: visible.length === 1 ? visible[0].id : '', amount: unallocated > 0 ? paisaToInput(unallocated) : '' })}>
            Add project
          </Button>
          {amountPaisa !== null && amountPaisa > 0 && (
            <p className={`mt-2 text-sm ${unallocated < 0 ? 'text-danger' : 'text-subtle'}`}>
              {unallocated === 0 ? 'Fully split to projects.' : unallocated > 0 ? `${formatNPR(unallocated)} not assigned to a project.` : `Split is ${formatNPR(-unallocated)} more than the payment.`}
            </p>
          )}
        </Card>

        {openBills.some((b) => v.allocations.some((a) => a.project_id === b.project_id)) && (
          <Card title="Which bills does it pay? (optional)">
            <ul className="flex flex-col gap-2">
              {openBills.filter((b) => v.allocations.some((a) => a.project_id === b.project_id)).map((b) => {
                const key = `${b.doc_id}:${b.project_id}`
                const on = key in v.settle
                return (
                  <li key={key} className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <Checkbox label={`Bill ${b.label} · ${code(b.project_id)}`} hint={`Owes ${formatNPR(b.amount_paisa)}`} checked={on}
                      onChange={(e) => {
                        const next = { ...getValues('settle') }
                        if (e.target.checked) next[key] = paisaToInput(b.amount_paisa)
                        else delete next[key]
                        setValue('settle', next)
                      }} />
                    {on && (
                      <Field label="Amount for this bill" htmlFor={`ps-${key}`}>
                        <MoneyInput id={`ps-${key}`} value={v.settle[key]} onChange={(e) => setValue('settle', { ...getValues('settle'), [key]: e.target.value })} />
                      </Field>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <div className="flex gap-2">
          <Button type="submit" busy={save.isPending}>Record payment</Button>
          <Button type="button" variant="secondary" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
        </div>
      </form>
    </>
  )
}
