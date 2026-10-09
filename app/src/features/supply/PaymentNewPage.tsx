// Record a payment to a supplier, subcontractor, crew or payee (req §12.1, §13, §14, §15).
// Optional split by project, optional matching to what is owed. A payment for a work
// package (an advance or part payment) goes wholly to the package's project.
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
import { useParties, usePartyOpenItems } from '../parties/api'
import { DOC_WORD, PARTY, PARTY_KINDS, partyFromParams, type PartyKind } from '../parties/kinds'
import { useProjects } from '../projects/api'
import { useCharges, useWorkPackage } from '../subcontract/api'
import { rpc, useRefreshMoney } from './api'
import { canPost } from './permissions'

type Values = {
  id: string
  op_key: string
  party_kind: PartyKind
  party_id: string
  package_id: string
  payment_date: string
  amount: string
  method: keyof typeof PAYMENT_METHODS
  reference: string
  notes: string
  allocations: Array<{ project_id: string; amount: string }>
  settle: Record<string, string> // "docId:projectId" -> amount
}

const OWED = new Set(['bill', 'charge', 'labour', 'expense'])

export function PaymentNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [error, setError] = useState('')
  const accounts = canPost(auth)
  const start = partyFromParams(params)

  const form = useForm<Values>({
    defaultValues: {
      id: newId(), op_key: newId(), party_kind: start.kind, party_id: start.id, package_id: params.get('package') ?? '',
      payment_date: todayKathmandu(), amount: '', method: 'cash', reference: '', notes: '', allocations: [], settle: {},
    },
  })
  const draft = useFormDraft(form, { userId: auth.userId, companyId: auth.companyId, formKey: 'payment-new' })
  const allocations = useFieldArray({ control: form.control, name: 'allocations' })
  const { register, control, watch, setValue, getValues } = form
  const v = watch()
  const parties = useParties(auth.companyId, v.party_kind)
  const pkg = useWorkPackage(v.package_id)
  const pkgCharges = useCharges(v.package_id, !!v.package_id)
  const openItems = usePartyOpenItems(v.party_id, !!v.party_id)
  const pkgChargeIds = new Set(pkgCharges.data?.map((c) => c.id))
  // A package payment can only clear that package's charges.
  const openDocs = openItems.data?.filter((i) => OWED.has(i.kind) && (!v.package_id || pkgChargeIds.has(i.doc_id!))) ?? []
  const docLabel = (d: (typeof openDocs)[number]) => (d.kind === 'bill' ? `Bill ${d.label}` : `${DOC_WORD[d.kind]}: ${d.label}`)

  // Coming from a bill (or other document): allocate to its projects and match it.
  const fromDoc = params.get('bill') ?? params.get('doc')
  useEffect(() => {
    if (!fromDoc || !openItems.data || getValues('allocations').length) return
    const rows = openDocs.filter((b) => b.doc_id === fromDoc)
    if (!rows.length) return
    setValue('allocations', rows.map((r) => ({ project_id: r.project_id!, amount: paisaToInput(r.amount_paisa) })))
    setValue('settle', Object.fromEntries(rows.map((r) => [`${r.doc_id}:${r.project_id}`, paisaToInput(r.amount_paisa)])))
    setValue('amount', paisaToInput(rows.reduce((s, r) => s + r.amount_paisa, 0)))
  }, [fromDoc, openItems.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // A package payment goes wholly to the package's project.
  const pkgProject = pkg.data?.project_id
  useEffect(() => {
    if (!pkgProject) return
    setValue('allocations', [{ project_id: pkgProject, amount: getValues('amount') }])
  }, [pkgProject, v.amount]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = projects.data ?? []
  const amountPaisa = parseNPR(v.amount)
  const allocated = v.allocations.reduce((s, a) => s + (parseNPR(a.amount) ?? 0), 0)
  const unallocated = (amountPaisa ?? 0) - allocated

  // Only documents shown now count: ticks left behind by a party or project change are ignored.
  const shownSettle = (vals: Values) => {
    const shown = new Set(openDocs.filter((b) => vals.allocations.some((a) => a.project_id === b.project_id)).map((b) => `${b.doc_id}:${b.project_id}`))
    return Object.entries(vals.settle).filter(([k, a]) => shown.has(k) && (parseNPR(a) ?? 0) > 0)
  }

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      const settlements = shownSettle(vals)
        .map(([key, a]) => { const [doc_id, project_id] = key.split(':'); return { doc_id, project_id, amount_paisa: parseNPR(a) } })
      return rpc('record_payment', { p_op_key: vals.op_key, p_payment: {
        id: vals.id, [PARTY[vals.party_kind].column]: vals.party_id, work_package_id: vals.package_id || null,
        payment_date: vals.payment_date, amount_paisa: parseNPR(vals.amount),
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
      !vals.party_id ? `Choose the ${PARTY[vals.party_kind].one.toLowerCase()}.`
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
  const kindLabel = PARTY[v.party_kind].one

  return (
    <>
      <PageHeader title="Record payment" subtitle="Payments reduce what you owe. They are never project cost." />
      {draft.restoredAt && <div className="mb-4"><Notice>Restored a payment you had not saved. Check it was not already recorded.</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-4">
        <Card>
          {pkg.data && (
            <p className="mb-3 text-sm text-subtle">
              For work package <span className="font-medium text-ink">{pkg.data.scope}</span> on {pkg.data.projects?.code}.
              Before any work is approved, this is an advance (peski), not cost.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {!v.package_id && (
              <Field label="Paid to" htmlFor="p-kind">
                <Select id="p-kind" value={v.party_kind}
                  onChange={(e) => { setValue('party_kind', e.target.value as PartyKind); setValue('party_id', '') }}>
                  {PARTY_KINDS.map((k) => <option key={k} value={k}>{PARTY[k].one}</option>)}
                </Select>
              </Field>
            )}
            {v.package_id ? (
              <Field label={kindLabel}><p className="py-2 text-ink">{pkg.data?.subcontractors?.name}</p></Field>
            ) : (
              <Field label={kindLabel} htmlFor="p-supplier">
                <Select id="p-supplier" {...register('party_id')}>
                  <option value="">Choose {kindLabel.toLowerCase()}</option>
                  {parties.data?.filter((s) => s.active || s.id === v.party_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
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

        {!v.package_id && (
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
        )}

        {openDocs.some((b) => v.allocations.some((a) => a.project_id === b.project_id)) && (
          <Card title="Which bills does it pay? (optional)">
            <ul className="flex flex-col gap-2">
              {openDocs.filter((b) => v.allocations.some((a) => a.project_id === b.project_id)).map((b) => {
                const key = `${b.doc_id}:${b.project_id}`
                const on = key in v.settle
                return (
                  <li key={key} className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <Checkbox label={`${docLabel(b)} · ${code(b.project_id)}`} hint={`Owes ${formatNPR(b.amount_paisa)}`} checked={on}
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
