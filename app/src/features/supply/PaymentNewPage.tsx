// Record a payment to a supplier, subcontractor, crew or payee (req §12.1, §13, §14, §15).
// Most payments pay particular bills, so the form starts from what is owed: tick the bills,
// the amount and the project split follow from them. Anything paid beyond the ticked bills is
// an advance for one project. "Pay as advance" keeps the free project split.
// A payment for a work package (an advance or part payment) goes wholly to the package's project.
// The payment id and operation key stay with the device draft until the server confirms,
// so a retry after a lost connection never records it twice (acceptance #13).
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompany } from '../../auth/AuthProvider'
import { PhotoPicker, uploadPending, type PendingPhoto } from '../../components/Attachments'
import { DateInput } from '../../components/DateInput'
import { MoneyInput } from '../../components/MoneyInput'
import { Button, Card, Checkbox, ErrorBanner, Field, FormActions, Input, Notice, PageHeader, Select } from '../../components/ui'
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
  mode: 'bills' | 'advance'
  payment_date: string
  amount: string
  method: keyof typeof PAYMENT_METHODS
  reference: string
  notes: string
  allocations: Array<{ project_id: string; amount: string }> // advance mode only
  settle: Record<string, string> // "docId:projectId" -> amount (bills mode)
  extra_project: string // where money beyond the ticked bills goes (bills mode)
  photos: PendingPhoto[]
}

const OWED = new Set(['bill', 'charge', 'labour', 'expense'])
const WITH_REFERENCE = new Set(['bank_transfer', 'cheque', 'wallet'])

export function PaymentNewPage() {
  const auth = useCompany()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projects = useProjects(auth.companyId)
  const refresh = useRefreshMoney()
  const [error, setError] = useState('')
  const [choosingParty, setChoosingParty] = useState(false)
  const accounts = canPost(auth)
  const start = partyFromParams(params)
  // The current project (from "+ Record" or a list page): where an advance goes unless changed.
  const projectParam = params.get('project') ?? ''

  const form = useForm<Values>({
    defaultValues: {
      id: newId(), op_key: newId(), party_kind: start.kind, party_id: start.id, package_id: params.get('package') ?? '',
      mode: 'bills', payment_date: todayKathmandu(), amount: '', method: 'cash', reference: '', notes: '',
      allocations: [], settle: {}, extra_project: projectParam, photos: [],
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
  const advanceHeld = openItems.data?.filter((i) => i.kind === 'payment').reduce((s, i) => s + i.amount_paisa, 0) ?? 0
  const owed = openDocs.reduce((s, d) => s + d.amount_paisa, 0)
  const docLabel = (d: (typeof openDocs)[number]) => (d.kind === 'bill' ? `Bill ${d.label}` : `${DOC_WORD[d.kind]}: ${d.label}`)
  const docKey = (d: (typeof openDocs)[number]) => `${d.doc_id}:${d.project_id}`
  const party = parties.data?.find((p) => p.id === v.party_id)
  const kindLabel = PARTY[v.party_kind].one
  const pkgProject = pkg.data?.project_id ?? ''
  const visible = projects.data ?? []
  // A new split row starts on the current project, unless it is already listed.
  const firstFree = () => {
    const used = new Set(getValues('allocations').map((a) => a.project_id))
    if (projectParam && !used.has(projectParam)) return projectParam
    return visible.length === 1 && !used.has(visible[0].id) ? visible[0].id : ''
  }
  const code = (id: string | null) => projects.data?.find((p) => p.id === id)?.code ?? ''

  // Ticking bills sets the amount; the amount can still be raised to pay extra as advance.
  const setSettle = (next: Record<string, string>) => {
    setValue('settle', next)
    setValue('amount', paisaToInput(Object.values(next).reduce((s, a) => s + (parseNPR(a) ?? 0), 0)))
  }

  // Coming from a bill (or other document): tick it.
  const fromDoc = params.get('bill') ?? params.get('doc')
  useEffect(() => {
    if (!fromDoc || !openItems.data || Object.keys(getValues('settle')).length) return
    const rows = openDocs.filter((b) => b.doc_id === fromDoc)
    if (rows.length) setSettle(Object.fromEntries(rows.map((r) => [docKey(r), paisaToInput(r.amount_paisa)])))
  }, [fromDoc, openItems.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only documents shown now count: ticks left behind by a party change are ignored.
  const shown = new Set(openDocs.map(docKey))
  const ticked = (vals: Values) => Object.entries(vals.settle).filter(([k, a]) => shown.has(k) && (parseNPR(a) ?? 0) > 0)
  const amountPaisa = parseNPR(v.amount)
  const tickedSum = ticked(v).reduce((s, [, a]) => s + (parseNPR(a) ?? 0), 0)
  const extra = (amountPaisa ?? 0) - tickedSum
  const billsMode = v.mode === 'bills' && openDocs.length > 0
  const allocated = v.allocations.reduce((s, a) => s + (parseNPR(a.amount) ?? 0), 0)
  const unallocated = (amountPaisa ?? 0) - allocated
  const extraProject = pkgProject || v.extra_project || (visible.length === 1 ? visible[0].id : '')

  /** The project split the server gets: from the ticked bills, the package, or typed in. */
  function splitOf(vals: Values) {
    const amount = parseNPR(vals.amount) ?? 0
    if (vals.package_id) return pkgProject ? [{ project_id: pkgProject, amount_paisa: amount }] : []
    if (!billsMode) return vals.allocations.filter((a) => (parseNPR(a.amount) ?? 0) > 0).map((a) => ({ project_id: a.project_id, amount_paisa: parseNPR(a.amount)! }))
    const byProject = new Map<string, number>()
    for (const [k, a] of ticked(vals)) byProject.set(k.split(':')[1], (byProject.get(k.split(':')[1]) ?? 0) + (parseNPR(a) ?? 0))
    if (amount > tickedSum && extraProject) byProject.set(extraProject, (byProject.get(extraProject) ?? 0) + amount - tickedSum)
    return [...byProject].map(([project_id, amount_paisa]) => ({ project_id, amount_paisa }))
  }

  const save = useMutation({
    mutationFn: async (vals: Values) => {
      const settlements = billsMode || vals.package_id
        ? ticked(vals).map(([key, a]) => { const [doc_id, project_id] = key.split(':'); return { doc_id, project_id, amount_paisa: parseNPR(a) } })
        : []
      await rpc('record_payment', { p_op_key: vals.op_key, p_payment: {
        id: vals.id, [PARTY[vals.party_kind].column]: vals.party_id, work_package_id: vals.package_id || null,
        payment_date: vals.payment_date, amount_paisa: parseNPR(vals.amount),
        method: vals.method, reference: (WITH_REFERENCE.has(vals.method) && vals.reference.trim()) || null, notes: vals.notes || null,
        allocations: splitOf(vals), settlements,
      } })
      // The payment is saved; a photo that fails to upload can be added again on the payment page.
      return uploadPending(auth.companyId, { payment_id: vals.id }, vals.photos)
    },
    onSuccess: async (failedPhotos, vals) => {
      await draft.clear()
      await refresh()
      navigate(`/payments/${vals.id}`, { replace: true, state: failedPhotos ? { photoFailed: failedPhotos } : undefined })
    },
  })

  function submit() {
    const vals = getValues()
    const split = splitOf(vals)
    const splitSum = split.reduce((s, a) => s + a.amount_paisa, 0)
    const problem =
      !vals.party_id ? `Choose the ${kindLabel.toLowerCase()}.`
      : !amountPaisa || amountPaisa <= 0 ? (billsMode ? 'Tick the bills it pays, or enter the amount.' : 'Enter the amount paid.')
      : billsMode && extra < 0 ? `The ticked bills add up to ${formatNPR(tickedSum)}, more than the payment. Untick one or lower an amount.`
      : !billsMode && !vals.package_id && vals.allocations.some((a) => !a.project_id || parseNPR(a.amount) === null) ? 'Each project split needs a project and an amount.'
      : !billsMode && new Set(vals.allocations.map((a) => a.project_id)).size !== vals.allocations.length ? 'A project is listed twice.'
      : splitSum > amountPaisa ? 'The project split is more than the payment.'
      : !accounts && splitSum !== amountPaisa ? (billsMode ? 'Choose the project the extra money is for.' : 'Split the whole payment across your projects.')
      : ''
    setError(problem)
    if (!problem) save.mutate(vals)
  }

  const fixedParty = !!start.id && v.party_id === start.id && !choosingParty

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
          {v.package_id || fixedParty ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm">
                <span className="text-subtle">Paid to </span>
                <span className="font-semibold text-ink">{v.package_id ? pkg.data?.subcontractors?.name : party?.name}</span>
                <span className="text-subtle"> · {kindLabel}</span>
              </p>
              {!v.package_id && <Button type="button" variant="ghost" onClick={() => setChoosingParty(true)}>Change</Button>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Paid to" htmlFor="p-kind">
                <Select id="p-kind" value={v.party_kind}
                  onChange={(e) => { setValue('party_kind', e.target.value as PartyKind); setValue('party_id', ''); setSettle({}) }}>
                  {PARTY_KINDS.map((k) => <option key={k} value={k}>{PARTY[k].one}</option>)}
                </Select>
              </Field>
              <Field label={kindLabel} htmlFor="p-supplier">
                <Select id="p-supplier" value={v.party_id} onChange={(e) => { setValue('party_id', e.target.value); setSettle({}) }}>
                  <option value="">Choose {kindLabel.toLowerCase()}</option>
                  {parties.data?.filter((s) => s.active || s.id === v.party_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          {v.party_id && openItems.data && (
            <p className="mt-2 text-sm text-subtle">
              {owed > 0 ? <>Unpaid: <span className="font-semibold text-ink">{formatNPR(owed)}</span></> : 'Nothing unpaid.'}
              {advanceHeld > 0 && <> · Advance not yet matched: {formatNPR(advanceHeld)}</>}
            </p>
          )}
        </Card>

        {billsMode && (
          <Card title={v.package_id ? 'Which approved work does it pay?' : 'Which bills does it pay?'}
            actions={!v.package_id && <Button type="button" variant="ghost" onClick={() => { setValue('mode', 'advance'); setValue('settle', {}) }}>Pay as advance instead</Button>}>
            <ul className="flex flex-col gap-2">
              {openDocs.map((b) => {
                const key = docKey(b)
                const on = key in v.settle
                return (
                  <li key={key} className="grid gap-2 sm:grid-cols-2 sm:items-end">
                    <Checkbox label={`${docLabel(b)} · ${code(b.project_id)}`} hint={`Owes ${formatNPR(b.amount_paisa)}`} checked={on}
                      onChange={(e) => {
                        const next = { ...getValues('settle') }
                        if (e.target.checked) next[key] = paisaToInput(b.amount_paisa)
                        else delete next[key]
                        setSettle(next)
                      }} />
                    {on && (
                      <Field label="Paying now" htmlFor={`ps-${key}`}>
                        <MoneyInput id={`ps-${key}`} value={v.settle[key]} onChange={(e) => setSettle({ ...getValues('settle'), [key]: e.target.value })} />
                      </Field>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {v.party_id && !billsMode && !v.package_id && (
          <Card title="Which project is it for?"
            actions={openDocs.length > 0 && <Button type="button" variant="ghost" onClick={() => { setValue('mode', 'bills'); allocations.replace([]) }}>Pay bills instead</Button>}>
            <p className="mb-3 text-sm text-subtle">
              {openDocs.length === 0 ? 'Nothing is unpaid, so this is an advance. ' : ''}
              {accounts
                ? 'Splitting by project is optional. Anything not split stays "not assigned" until you assign it.'
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
              onClick={() => allocations.append({ project_id: firstFree(), amount: unallocated > 0 ? paisaToInput(unallocated) : '' })}>
              Add project
            </Button>
            {amountPaisa !== null && amountPaisa > 0 && (
              <p className={`mt-2 text-sm ${unallocated < 0 ? 'text-danger' : 'text-subtle'}`}>
                {unallocated === 0 ? 'Fully split to projects.' : unallocated > 0 ? `${formatNPR(unallocated)} not assigned to a project.` : `Split is ${formatNPR(-unallocated)} more than the payment.`}
              </p>
            )}
          </Card>
        )}

        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount paid" htmlFor="p-amount" hint={billsMode ? 'Set from the ticked bills. Raise it to pay extra as advance.' : undefined}>
              <Controller control={control} name="amount" render={({ field }) => <MoneyInput id="p-amount" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Paid on" htmlFor="p-date">
              <Controller control={control} name="payment_date" render={({ field }) => (
                <DateInput id="p-date" value={field.value} onChange={field.onChange} display={auth.dateDisplay} />
              )} />
            </Field>
            {billsMode && !v.package_id && extra > 0 && (
              <Field label={`Extra ${formatNPR(extra)} is advance for`} htmlFor="p-extra">
                <Select id="p-extra" value={extraProject} onChange={(e) => setValue('extra_project', e.target.value)}>
                  <option value="">{accounts ? 'Not assigned yet' : 'Choose project'}</option>
                  {visible.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="How" htmlFor="p-method">
              <Select id="p-method" {...register('method')}>
                {Object.entries(PAYMENT_METHODS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            {WITH_REFERENCE.has(v.method) && (
              <Field label="Reference" htmlFor="p-ref" hint="Cheque number, transaction id"><Input id="p-ref" {...register('reference')} /></Field>
            )}
            <Field label="Notes" htmlFor="p-notes" hint="Optional"><Input id="p-notes" {...register('notes')} /></Field>
          </div>
          <div className="mt-3">
            <Controller control={control} name="photos" render={({ field }) => (
              <PhotoPicker value={field.value} onChange={field.onChange} label="Add receipt or cheque photo" what="Receipt photo" />
            )} />
          </div>
        </Card>

        <ErrorBanner>{error || (save.error && friendlyError(save.error))}</ErrorBanner>
        <FormActions>
          <Button type="submit" busy={save.isPending}>Record payment{amountPaisa ? ` of ${formatNPR(amountPaisa)}` : ''}</Button>
          <Button type="button" variant="ghost" onClick={async () => { await draft.clear(); navigate(-1) }}>Cancel</Button>
          {v.party_id && !v.package_id && (
            <Link className="text-sm text-subtle underline underline-offset-4" to={`${PARTY[v.party_kind].path}/${v.party_id}`}>Open khata</Link>
          )}
        </FormActions>
      </form>
    </>
  )
}
